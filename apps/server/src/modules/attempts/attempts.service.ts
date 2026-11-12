/**
 * Examination engine: start (with immutable snapshots), autosave, submit, auto-submit.
 * Answer keys never leave the server before submission.
 */
import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { Prisma, type ExaminationAttempt } from '@prisma/client';
import { rng, shuffle, USABLE_QUESTION_STATUSES, type ExplanationVisibility, type ResultVisibility } from '@solar/shared';
import { prisma, type Tx } from '../../db';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { assignedWhere } from '../exams/exams.service';
import { gradeAnswer, summarise, type QuestionSnapshot } from '../results/scoring';
import { dec } from '../../lib/http';

/** Grace period for network latency on autosave/submit after the deadline. */
export const GRACE_MS = 15_000;

export interface ExamSnapshot {
  name: string;
  code: string;
  durationMinutes: number;
  passingScore: number;
  resultVisibility: ResultVisibility;
  explanationVisibility: ExplanationVisibility;
  endAt: string | null;
}

// ───────────── Candidate exam list ─────────────

export async function myExams(userId: string) {
  const exams = await prisma.examination.findMany({
    where: { status: { in: ['PUBLISHED', 'CLOSED'] }, ...assignedWhere(userId) },
    include: {
      _count: { select: { questions: true } },
      assignments: { where: { OR: [{ userId }, { group: { members: { some: { userId } } } }] }, select: { dueAt: true } },
      attempts: { where: { userId }, orderBy: { attemptNo: 'desc' }, include: { result: { select: { scorePercent: true, passed: true } } } },
    },
    orderBy: [{ status: 'asc' }, { endAt: 'asc' }, { createdAt: 'desc' }],
  });
  const now = new Date();
  return exams.map((e) => {
    const inProgress = e.attempts.find((a) => a.status === 'IN_PROGRESS');
    const finished = e.attempts.filter((a) => a.status !== 'IN_PROGRESS');
    const dueAt = e.assignments.map((a) => a.dueAt).filter(Boolean).sort()[0] ?? null;
    let availability: 'AVAILABLE' | 'IN_PROGRESS' | 'NOT_OPEN' | 'EXPIRED' | 'NO_ATTEMPTS' | 'CLOSED' = 'AVAILABLE';
    if (inProgress) availability = 'IN_PROGRESS';
    else if (e.status === 'CLOSED') availability = 'CLOSED';
    else if (e.startAt && e.startAt > now) availability = 'NOT_OPEN';
    else if (e.endAt && e.endAt < now) availability = 'EXPIRED';
    else if (finished.length >= e.maxAttempts) availability = 'NO_ATTEMPTS';
    const best = e.resultVisibility === 'HIDDEN' ? null : finished.reduce<number | null>((m, a) => (a.result ? Math.max(m ?? 0, Number(a.result.scorePercent)) : m), null);
    return {
      id: e.id, code: e.code, name: e.name, description: e.description, durationMinutes: e.durationMinutes, passingScore: Number(e.passingScore),
      questionCount: e._count.questions, maxAttempts: e.maxAttempts, attemptsUsed: finished.length, startAt: e.startAt, endAt: e.endAt, dueAt,
      availability, inProgressAttemptId: inProgress?.id ?? null, resultVisibility: e.resultVisibility,
      bestScore: best,
      attempts: finished.map((a) => ({ id: a.id, attemptNo: a.attemptNo, submittedAt: a.submittedAt, status: a.status, ...(e.resultVisibility === 'HIDDEN' || !a.result ? {} : { score: Number(a.result.scorePercent), passed: a.result.passed }) })),
    };
  });
}

// ───────────── Start ─────────────

function buildSnapshot(q: Prisma.QuestionGetPayload<{ include: { options: true; references: true; media: true } }>, randomizeOptions: boolean, rand: () => number): QuestionSnapshot {
  const opts = [...q.options].sort((a, b) => a.sortOrder - b.sortOrder);
  const ordered = randomizeOptions && q.type !== 'TRUE_FALSE' ? shuffle(opts, rand) : opts;
  return {
    code: q.code,
    title: q.title,
    content: q.content,
    type: q.type,
    assumptions: q.assumptions,
    isCalculation: q.isCalculation,
    isScenario: q.isScenario,
    media: q.media.map((m) => ({ id: m.id, caption: m.caption })),
    options: ordered.map((o) => ({ id: o.id, label: o.label, isCorrect: o.isCorrect, rationale: o.rationale })),
    numeric:
      q.type === 'NUMERIC' && q.numericAnswer != null
        ? { answer: Number(q.numericAnswer), unit: q.numericUnit, tolerance: Number(q.numericTolerance ?? 0), toleranceType: q.toleranceType ?? 'RELATIVE', decimals: q.numericDecimals }
        : null,
    explanation: q.explanation,
    calcMethod: q.calcMethod,
    references: q.references.map((r) => ({ standard: r.standard, edition: r.edition, clause: r.clause, jurisdiction: r.jurisdiction })),
  };
}

export async function startAttempt(req: FastifyRequest, examId: string) {
  const userId = req.user!.id;
  const exam = await prisma.examination.findFirst({
    where: { id: examId, ...assignedWhere(userId) },
    include: { questions: { orderBy: { sortOrder: 'asc' }, include: { question: { include: { options: true, references: true, media: true, category: true } } } } },
  });
  if (!exam) throw notFound('Không tìm thấy bài thi được giao cho bạn');
  const existing = await prisma.examinationAttempt.findFirst({ where: { examinationId: examId, userId, status: 'IN_PROGRESS' } });
  if (existing) return existing;
  const now = new Date();
  if (exam.status !== 'PUBLISHED') throw forbidden('Kỳ thi hiện không mở');
  if (exam.startAt && exam.startAt > now) throw forbidden('Chưa đến thời gian mở đề');
  if (exam.endAt && exam.endAt <= now) throw forbidden('Kỳ thi đã hết hạn');
  if (!exam.questions.length) throw badRequest('Đề thi chưa có câu hỏi');
  const bad = exam.questions.filter((q) => !USABLE_QUESTION_STATUSES.includes(q.question.status));
  if (bad.length) throw conflict('Đề thi có câu hỏi không còn hiệu lực. Vui lòng liên hệ người quản lý kỳ thi.');
  const used = await prisma.examinationAttempt.count({ where: { examinationId: examId, userId } });
  if (used >= exam.maxAttempts) throw forbidden('Bạn đã sử dụng hết số lần thi cho phép');

  const seed = crypto.randomBytes(4).readUInt32BE(0);
  const rand = rng(seed);
  const ordered = exam.randomizeQuestions ? shuffle(exam.questions, rand) : exam.questions;
  const durationEnd = new Date(now.getTime() + exam.durationMinutes * 60_000);
  const deadlineAt = exam.endAt && exam.endAt < durationEnd ? exam.endAt : durationEnd;
  const snapshot: ExamSnapshot = {
    name: exam.name, code: exam.code, durationMinutes: exam.durationMinutes, passingScore: Number(exam.passingScore),
    resultVisibility: exam.resultVisibility, explanationVisibility: exam.explanationVisibility, endAt: exam.endAt?.toISOString() ?? null,
  };

  try {
    const attempt = await prisma.$transaction(async (tx) => {
      const a = await tx.examinationAttempt.create({
        data: {
          examinationId: examId, userId, attemptNo: used + 1, deadlineAt, startedAt: now,
          ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
          examSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.attemptQuestion.createMany({
        data: ordered.map((eq, i) => ({
          attemptId: a.id,
          questionId: eq.questionId,
          questionVersion: eq.question.version,
          sortOrder: i + 1,
          points: eq.points,
          categoryId: eq.question.categoryId,
          categoryCode: eq.question.category.code,
          categoryName: eq.question.category.name,
          difficulty: eq.question.difficulty,
          snapshot: buildSnapshot(eq.question, exam.randomizeOptions, rand) as unknown as Prisma.InputJsonValue,
        })),
      });
      await audit(req, 'attempt.start', 'attempt', a.id, { examId, attemptNo: a.attemptNo }, tx);
      return a;
    });
    return attempt;
  } catch (e) {
    // Concurrent double-click: the partial unique index allows only one IN_PROGRESS attempt.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const a = await prisma.examinationAttempt.findFirst({ where: { examinationId: examId, userId, status: 'IN_PROGRESS' } });
      if (a) return a;
    }
    throw e;
  }
}

// ───────────── Candidate view (sanitised) ─────────────

async function ownAttempt(attemptId: string, userId: string) {
  const a = await prisma.examinationAttempt.findUnique({ where: { id: attemptId } });
  if (!a || a.userId !== userId) throw notFound('Không tìm thấy lượt thi');
  return a;
}

export async function getAttemptForCandidate(req: FastifyRequest, attemptId: string) {
  let a = await ownAttempt(attemptId, req.user!.id);
  if (a.status === 'IN_PROGRESS' && Date.now() > a.deadlineAt.getTime() + GRACE_MS) {
    await submitAttempt(null, a.id, true);
    a = await ownAttempt(attemptId, req.user!.id);
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { fullName: true, username: true, department: true } });
  const snap = a.examSnapshot as unknown as ExamSnapshot;
  if (a.status !== 'IN_PROGRESS') return { id: a.id, status: a.status, exam: { name: snap.name, code: snap.code }, submittedAt: a.submittedAt };
  const qs = await prisma.attemptQuestion.findMany({ where: { attemptId }, orderBy: { sortOrder: 'asc' }, include: { answer: true } });
  return {
    id: a.id,
    status: a.status,
    attemptNo: a.attemptNo,
    startedAt: a.startedAt,
    deadlineAt: a.deadlineAt,
    serverNow: new Date(),
    exam: { name: snap.name, code: snap.code, durationMinutes: snap.durationMinutes },
    candidate: user,
    questions: qs.map((q) => {
      const s = q.snapshot as unknown as QuestionSnapshot;
      return {
        id: q.id,
        order: q.sortOrder,
        type: s.type,
        title: s.title,
        content: s.content,
        assumptions: s.assumptions,
        unit: s.numeric?.unit ?? null,
        // No isCorrect / rationale / explanation / numeric answer here.
        options: s.options.map((o) => ({ id: o.id, label: o.label })),
        answer: q.answer
          ? { selectedOptionIds: q.answer.selectedOptionIds, numericValue: dec(q.answer.numericValue), flagged: q.answer.flagged }
          : { selectedOptionIds: [], numericValue: null, flagged: false },
      };
    }),
  };
}

// ───────────── Autosave ─────────────

export async function saveAnswer(req: FastifyRequest, attemptId: string, input: { attemptQuestionId: string; selectedOptionIds?: string[]; numericValue?: number | null; flagged?: boolean }) {
  const a = await ownAttempt(attemptId, req.user!.id);
  if (a.status !== 'IN_PROGRESS') throw new AppError(409, 'Bài thi đã được nộp. Không thể thay đổi câu trả lời.', 'SUBMITTED');
  if (Date.now() > a.deadlineAt.getTime() + GRACE_MS) {
    await submitAttempt(null, a.id, true);
    throw new AppError(409, 'Đã hết thời gian làm bài. Bài thi đã được tự động nộp.', 'TIME_UP');
  }
  const q = await prisma.attemptQuestion.findFirst({ where: { id: input.attemptQuestionId, attemptId } });
  if (!q) throw notFound('Câu hỏi không thuộc lượt thi này');
  const s = q.snapshot as unknown as QuestionSnapshot;
  const data: Prisma.CandidateAnswerUncheckedUpdateInput = {};
  if (input.selectedOptionIds !== undefined) {
    if (s.type === 'NUMERIC') throw badRequest('Câu hỏi này yêu cầu nhập giá trị số');
    const valid = new Set(s.options.map((o) => o.id));
    const ids = [...new Set(input.selectedOptionIds)];
    if (ids.some((id) => !valid.has(id))) throw badRequest('Phương án không hợp lệ');
    if (s.type !== 'MULTIPLE_CHOICE' && ids.length > 1) throw badRequest('Chỉ được chọn một phương án');
    data.selectedOptionIds = ids;
  }
  if (input.numericValue !== undefined) {
    if (s.type !== 'NUMERIC') throw badRequest('Câu hỏi này không nhận giá trị số');
    if (input.numericValue !== null && Math.abs(input.numericValue) > 1e12) throw badRequest('Giá trị số quá lớn');
    data.numericValue = input.numericValue;
  }
  if (input.flagged !== undefined) data.flagged = input.flagged;
  const touched = input.selectedOptionIds !== undefined || input.numericValue !== undefined;
  const ans = await prisma.candidateAnswer.upsert({
    where: { attemptQuestionId: q.id },
    create: {
      attemptQuestionId: q.id,
      selectedOptionIds: (data.selectedOptionIds as string[] | undefined) ?? [],
      numericValue: (data.numericValue as number | null | undefined) ?? null,
      flagged: (data.flagged as boolean | undefined) ?? false,
      answeredAt: touched ? new Date() : null,
    },
    update: { ...data, ...(touched ? { answeredAt: new Date() } : {}) },
  });
  return { attemptQuestionId: q.id, selectedOptionIds: ans.selectedOptionIds, numericValue: dec(ans.numericValue), flagged: ans.flagged, savedAt: ans.updatedAt };
}

// ───────────── Submit / grading ─────────────

export async function gradeAttempt(tx: Tx, attempt: ExaminationAttempt) {
  const qs = await tx.attemptQuestion.findMany({ where: { attemptId: attempt.id }, include: { answer: true } });
  const snap = attempt.examSnapshot as unknown as ExamSnapshot;
  const graded = [];
  for (const q of qs) {
    const s = q.snapshot as unknown as QuestionSnapshot;
    const ans = q.answer ? { selectedOptionIds: q.answer.selectedOptionIds, numericValue: dec(q.answer.numericValue) } : null;
    const correct = gradeAnswer(s, ans);
    const points = Number(q.points);
    if (q.answer) await tx.candidateAnswer.update({ where: { id: q.answer.id }, data: { isCorrect: correct, score: correct ? points : 0 } });
    graded.push({ categoryId: q.categoryId, categoryCode: q.categoryCode, categoryName: q.categoryName, difficulty: q.difficulty, points, correct });
  }
  return summarise(graded, snap.passingScore);
}

/**
 * Idempotent, race-safe submission. The attempt row is locked; a second concurrent
 * submit sees status != IN_PROGRESS and simply returns the existing result.
 */
export async function submitAttempt(req: FastifyRequest | null, attemptId: string, auto = false) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM examination_attempts WHERE id = ${attemptId} FOR UPDATE`;
    const a = await tx.examinationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    if (a.status !== 'IN_PROGRESS') return { attemptId: a.id, status: a.status, alreadySubmitted: true };
    const now = new Date();
    const isLate = now.getTime() > a.deadlineAt.getTime();
    const submittedAt = isLate ? a.deadlineAt : now;
    const s = await gradeAttempt(tx, a);
    const status = auto || isLate ? 'AUTO_SUBMITTED' : 'SUBMITTED';
    await tx.examinationAttempt.update({ where: { id: a.id }, data: { status, submittedAt } });
    await tx.examinationResult.create({
      data: {
        attemptId: a.id,
        examinationId: a.examinationId,
        userId: a.userId,
        scorePercent: s.scorePercent,
        pointsEarned: s.pointsEarned,
        pointsTotal: s.pointsTotal,
        correctCount: s.correct,
        incorrectCount: s.incorrect,
        unansweredCount: s.unanswered,
        durationSeconds: Math.max(0, Math.round((submittedAt.getTime() - a.startedAt.getTime()) / 1000)),
        passed: s.passed,
        byCategory: s.byCategory as unknown as Prisma.InputJsonValue,
        byDifficulty: s.byDifficulty as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({
      data: { actorId: req?.user?.id ?? null, action: status === 'AUTO_SUBMITTED' ? 'attempt.auto_submit' : 'attempt.submit', entityType: 'attempt', entityId: a.id, details: { score: s.scorePercent }, ip: req?.ip ?? null },
    });
    return { attemptId: a.id, status, alreadySubmitted: false };
  });
}

/** Background job: auto-submit attempts whose deadline (plus grace) has passed. */
export async function autoSubmitExpired() {
  const due = await prisma.examinationAttempt.findMany({
    where: { status: 'IN_PROGRESS', deadlineAt: { lt: new Date(Date.now() - GRACE_MS) } },
    select: { id: true },
    take: 200,
  });
  for (const a of due) await submitAttempt(null, a.id, true).catch(() => undefined);
  return due.length;
}
