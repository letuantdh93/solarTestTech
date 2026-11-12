import type { FastifyRequest } from 'fastify';
import { prisma } from '../../db';
import { hasPerm } from '../../lib/auth';
import { forbidden, notFound } from '../../lib/errors';
import { dec } from '../../lib/http';
import type { ExamSnapshot } from '../attempts/attempts.service';
import type { Bucket, QuestionSnapshot } from './scoring';

/** Technical weakness analysis derived from category buckets. */
export function analyseCompetency(byCategory: Bucket[]) {
  const sorted = [...byCategory].sort((a, b) => a.percent - b.percent);
  return {
    weaknesses: sorted.filter((b) => b.level === 'WEAK' || b.level === 'NEEDS_IMPROVEMENT').map((b) => ({ key: b.key, code: b.code, label: b.label, percent: b.percent, level: b.level })),
    strengths: [...sorted].reverse().filter((b) => b.level === 'EXCELLENT' || b.level === 'GOOD').map((b) => ({ key: b.key, code: b.code, label: b.label, percent: b.percent, level: b.level })),
  };
}

export async function getResultDetail(req: FastifyRequest, attemptId: string) {
  const a = await prisma.examinationAttempt.findUnique({
    where: { id: attemptId },
    include: {
      result: true,
      user: { select: { id: true, fullName: true, username: true, department: true, position: true } },
      examination: { select: { id: true, status: true, endAt: true } },
    },
  });
  if (!a) throw notFound('Không tìm thấy kết quả');
  const staff = hasPerm(req, 'results.view_all');
  const own = a.userId === req.user!.id && hasPerm(req, 'results.view_own');
  if (!staff && !own) throw forbidden();
  if (a.status === 'IN_PROGRESS' || !a.result) return { attemptId: a.id, status: a.status, pending: true };

  const snap = a.examSnapshot as unknown as ExamSnapshot;
  const visibility = staff ? 'DETAILED' : snap.resultVisibility;
  const examClosed = a.examination.status === 'CLOSED' || a.examination.status === 'ARCHIVED' || (a.examination.endAt != null && a.examination.endAt < new Date());
  const showExplanation = staff || (visibility === 'DETAILED' && (snap.explanationVisibility === 'AFTER_SUBMIT' || (snap.explanationVisibility === 'AFTER_CLOSE' && examClosed)));
  const r = a.result;
  const base = {
    attemptId: a.id,
    status: a.status,
    visibility,
    exam: { id: a.examination.id, name: snap.name, code: snap.code, durationMinutes: snap.durationMinutes, passingScore: snap.passingScore },
    candidate: a.user,
    attemptNo: a.attemptNo,
    startedAt: a.startedAt,
    submittedAt: a.submittedAt,
  };
  if (visibility === 'HIDDEN') return base;
  const summary = {
    scorePercent: Number(r.scorePercent),
    pointsEarned: Number(r.pointsEarned),
    pointsTotal: Number(r.pointsTotal),
    correctCount: r.correctCount,
    incorrectCount: r.incorrectCount,
    unansweredCount: r.unansweredCount,
    durationSeconds: r.durationSeconds,
    passed: r.passed,
  };
  if (visibility === 'SCORE_ONLY') return { ...base, summary };

  const byCategory = r.byCategory as unknown as Bucket[];
  const qs = await prisma.attemptQuestion.findMany({ where: { attemptId }, orderBy: { sortOrder: 'asc' }, include: { answer: true } });
  return {
    ...base,
    summary,
    byCategory,
    byDifficulty: r.byDifficulty as unknown as Bucket[],
    analysis: analyseCompetency(byCategory),
    showExplanation,
    questions: qs.map((q) => {
      const s = q.snapshot as unknown as QuestionSnapshot;
      return {
        id: q.id,
        order: q.sortOrder,
        code: s.code,
        type: s.type,
        title: s.title,
        content: s.content,
        assumptions: s.assumptions,
        categoryCode: q.categoryCode,
        categoryName: q.categoryName,
        difficulty: q.difficulty,
        points: Number(q.points),
        options: s.options.map((o) => ({ id: o.id, label: o.label, isCorrect: o.isCorrect, ...(showExplanation ? { rationale: o.rationale } : {}) })),
        numeric: s.numeric,
        answer: q.answer ? { selectedOptionIds: q.answer.selectedOptionIds, numericValue: dec(q.answer.numericValue) } : null,
        isCorrect: q.answer?.isCorrect ?? null,
        ...(showExplanation ? { explanation: s.explanation, calcMethod: s.calcMethod, references: s.references } : {}),
      };
    }),
  };
}
