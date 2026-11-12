import type { FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { USABLE_QUESTION_STATUSES, type GenerationConfig, examInputSchema, assignmentSchema } from '@solar/shared';
import type { z } from 'zod';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { generateSelection, type PoolQuestion } from './generator';

type ExamInput = z.infer<typeof examInputSchema>;

export async function loadPool(categoryIds: string[]): Promise<PoolQuestion[]> {
  return prisma.question.findMany({
    where: { categoryId: { in: categoryIds }, status: { in: USABLE_QUESTION_STATUSES } },
    select: { id: true, code: true, categoryId: true, difficulty: true, type: true, isCalculation: true, isScenario: true, conceptKey: true },
  });
}

export async function runGeneration(cfg: GenerationConfig) {
  const ids = cfg.categoryDistribution.map((c) => c.categoryId);
  const cats = await prisma.questionCategory.findMany({ where: { id: { in: ids } } });
  if (cats.length !== new Set(ids).size || cats.some((c) => c.parentId)) throw badRequest('Danh sách lĩnh vực không hợp lệ');
  const pool = await loadPool(ids);
  const labels = Object.fromEntries(cats.map((c) => [c.id, `${c.code}. ${c.name}`]));
  const result = generateSelection(pool, cfg, labels);
  const questions = await prisma.question.findMany({
    where: { id: { in: result.questionIds } },
    select: { id: true, code: true, title: true, type: true, difficulty: true, isCalculation: true, isScenario: true, conceptKey: true, category: { select: { id: true, code: true, name: true } } },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  return { ...result, questions: result.questionIds.map((id) => byId.get(id)!) };
}

/** Bank availability matrix (category × difficulty) to guide matrix design. */
export async function availabilityMatrix(types?: string[]) {
  const rows = await prisma.question.groupBy({
    by: ['categoryId', 'difficulty'],
    where: { status: { in: USABLE_QUESTION_STATUSES }, ...(types?.length ? { type: { in: types as never } } : {}) },
    _count: { _all: true },
  });
  const out: Record<string, Record<number, number>> = {};
  for (const r of rows) (out[r.categoryId] ??= { 1: 0, 2: 0, 3: 0, 4: 0 })[r.difficulty] = r._count._all;
  return out;
}

async function nextExamCode() {
  const y = new Date().getFullYear();
  const prefix = `DT-${y}-`;
  const rows = await prisma.$queryRaw<Array<{ n: number | null }>>(Prisma.sql`
    SELECT MAX(CAST(substring(code from ${prefix.length + 1}::int) AS INTEGER)) AS n FROM examinations WHERE code LIKE ${prefix + '%'}`);
  return `${prefix}${String(Number(rows[0]?.n ?? 0) + 1).padStart(4, '0')}`;
}

export const examInclude = {
  createdBy: { select: { id: true, fullName: true } },
  blueprint: { select: { id: true, name: true } },
  _count: { select: { questions: true, assignments: true, attempts: true, results: true } },
} satisfies Prisma.ExaminationInclude;

export function serializeExam<T extends { passingScore: Prisma.Decimal }>(e: T) {
  return { ...e, passingScore: Number(e.passingScore) };
}

export async function createExam(req: FastifyRequest, input: ExamInput & { questionIds?: string[]; generationConfig?: GenerationConfig | null }) {
  const questionIds = [...new Set(input.questionIds ?? [])];
  if (questionIds.length) await assertUsable(questionIds);
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const exam = await tx.examination.create({
          data: {
            code: await nextExamCode(),
            name: input.name,
            description: input.description ?? null,
            targetAudience: input.targetAudience ?? null,
            examCategory: input.examCategory ?? null,
            durationMinutes: input.durationMinutes,
            passingScore: input.passingScore,
            randomizeQuestions: input.randomizeQuestions,
            randomizeOptions: input.randomizeOptions,
            maxAttempts: input.maxAttempts,
            startAt: input.startAt ?? null,
            endAt: input.endAt ?? null,
            resultVisibility: input.resultVisibility,
            explanationVisibility: input.explanationVisibility,
            blueprintId: input.blueprintId ?? null,
            generationConfig: (input.generationConfig ?? undefined) as Prisma.InputJsonValue | undefined,
            createdById: req.user!.id,
            questions: { create: questionIds.map((questionId, i) => ({ questionId, sortOrder: i })) },
          },
          include: examInclude,
        });
        await audit(req, 'exam.create', 'exam', exam.id, { code: exam.code, questions: questionIds.length }, tx);
        return exam;
      });
    } catch (e) {
      if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
}

async function assertUsable(ids: string[]) {
  const qs = await prisma.question.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, status: true } });
  if (qs.length !== ids.length) throw badRequest('Một số câu hỏi không tồn tại');
  const bad = qs.filter((q) => !USABLE_QUESTION_STATUSES.includes(q.status));
  if (bad.length) throw badRequest(`Chỉ câu hỏi đã duyệt mới được dùng trong đề thi chính thức: ${bad.map((b) => b.code).join(', ')}`);
}

async function getExamOrThrow(id: string) {
  const e = await prisma.examination.findUnique({ where: { id }, include: examInclude });
  if (!e) throw notFound('Không tìm thấy đề thi');
  return e;
}

export async function updateExam(req: FastifyRequest, id: string, input: ExamInput) {
  const e = await getExamOrThrow(id);
  if (e.status === 'ARCHIVED') throw badRequest('Đề thi đã lưu trữ không thể chỉnh sửa');
  const updated = await prisma.examination.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description ?? null,
      targetAudience: input.targetAudience ?? null,
      examCategory: input.examCategory ?? null,
      durationMinutes: input.durationMinutes,
      passingScore: input.passingScore,
      randomizeQuestions: input.randomizeQuestions,
      randomizeOptions: input.randomizeOptions,
      maxAttempts: input.maxAttempts,
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
      resultVisibility: input.resultVisibility,
      explanationVisibility: input.explanationVisibility,
    },
    include: examInclude,
  });
  await audit(req, 'exam.update', 'exam', id);
  return updated;
}

export async function setExamQuestions(req: FastifyRequest, id: string, questionIds: string[], points?: Record<string, number>) {
  const e = await getExamOrThrow(id);
  if (e._count.attempts > 0) throw conflict('Đề đã có lượt thi – không thể thay đổi danh sách câu hỏi. Hãy nhân bản đề để chỉnh sửa.');
  const ids = [...new Set(questionIds)];
  await assertUsable(ids);
  await prisma.$transaction(async (tx) => {
    await tx.examinationQuestion.deleteMany({ where: { examinationId: id } });
    await tx.examinationQuestion.createMany({ data: ids.map((questionId, i) => ({ examinationId: id, questionId, sortOrder: i, points: points?.[questionId] ?? 1 })) });
    await audit(req, 'exam.questions', 'exam', id, { count: ids.length }, tx);
  });
}

export async function changeExamStatus(req: FastifyRequest, id: string, to: 'PUBLISHED' | 'CLOSED' | 'ARCHIVED' | 'DRAFT') {
  const e = await getExamOrThrow(id);
  const allowed: Record<string, string[]> = { DRAFT: ['PUBLISHED', 'ARCHIVED'], PUBLISHED: ['CLOSED', 'DRAFT'], CLOSED: ['PUBLISHED', 'ARCHIVED'], ARCHIVED: [] };
  if (!allowed[e.status]!.includes(to)) throw badRequest('Không thể chuyển trạng thái đề thi theo yêu cầu');
  if (to === 'DRAFT' && e._count.attempts > 0) throw conflict('Đề đã có lượt thi, không thể đưa về bản nháp. Hãy đóng kỳ thi.');
  if (to === 'PUBLISHED') {
    const qs = await prisma.examinationQuestion.findMany({ where: { examinationId: id }, include: { question: { select: { code: true, status: true } } } });
    if (!qs.length) throw badRequest('Đề thi cần có ít nhất 1 câu hỏi trước khi phát hành');
    const bad = qs.filter((q) => !USABLE_QUESTION_STATUSES.includes(q.question.status));
    if (bad.length) throw badRequest(`Một số câu hỏi không còn ở trạng thái Đã duyệt: ${bad.map((b) => b.question.code).join(', ')}`);
    if (e.endAt && e.endAt < new Date()) throw badRequest('Thời điểm hết hạn đã qua. Vui lòng cập nhật lịch thi.');
  }
  const updated = await prisma.examination.update({ where: { id }, data: { status: to, ...(to === 'PUBLISHED' && !e.publishedAt ? { publishedAt: new Date() } : {}) }, include: examInclude });
  await audit(req, 'exam.status', 'exam', id, { from: e.status, to });
  return updated;
}

export async function duplicateExam(req: FastifyRequest, id: string) {
  const e = await prisma.examination.findUnique({ where: { id }, include: { questions: { orderBy: { sortOrder: 'asc' } } } });
  if (!e) throw notFound('Không tìm thấy đề thi');
  const usable = await prisma.question.findMany({ where: { id: { in: e.questions.map((q) => q.questionId) }, status: { in: USABLE_QUESTION_STATUSES } }, select: { id: true } });
  const usableIds = new Set(usable.map((u) => u.id));
  const copy = await createExam(req, {
    name: `${e.name} (bản sao)`,
    description: e.description,
    targetAudience: e.targetAudience,
    examCategory: e.examCategory,
    durationMinutes: e.durationMinutes,
    passingScore: Number(e.passingScore),
    randomizeQuestions: e.randomizeQuestions,
    randomizeOptions: e.randomizeOptions,
    maxAttempts: e.maxAttempts,
    startAt: null,
    endAt: null,
    resultVisibility: e.resultVisibility,
    explanationVisibility: e.explanationVisibility,
    blueprintId: e.blueprintId,
    questionIds: e.questions.map((q) => q.questionId).filter((qid) => usableIds.has(qid)),
    generationConfig: e.generationConfig as GenerationConfig | null,
  });
  await audit(req, 'exam.duplicate', 'exam', copy.id, { from: id, skipped: e.questions.length - usableIds.size });
  return { exam: copy, skipped: e.questions.length - usableIds.size };
}

export async function deleteExam(req: FastifyRequest, id: string) {
  const e = await getExamOrThrow(id);
  if (e._count.attempts > 0) throw conflict('Đề đã có lượt thi – không thể xóa. Hãy lưu trữ để bảo toàn lịch sử.');
  await prisma.examination.delete({ where: { id } });
  await audit(req, 'exam.delete', 'exam', id, { code: e.code });
}

export async function assign(req: FastifyRequest, id: string, input: z.infer<typeof assignmentSchema>) {
  await getExamOrThrow(id);
  const users = input.userIds.length ? await prisma.user.findMany({ where: { id: { in: input.userIds }, isActive: true }, select: { id: true } }) : [];
  const groups = input.groupIds.length ? await prisma.userGroup.findMany({ where: { id: { in: input.groupIds } }, select: { id: true } }) : [];
  const data = [
    ...users.map((u) => ({ examinationId: id, userId: u.id, assignedById: req.user!.id, dueAt: input.dueAt ?? null })),
    ...groups.map((g) => ({ examinationId: id, groupId: g.id, assignedById: req.user!.id, dueAt: input.dueAt ?? null })),
  ];
  const r = await prisma.examinationAssignment.createMany({ data, skipDuplicates: true });
  await audit(req, 'exam.assign', 'exam', id, { users: users.length, groups: groups.length });
  return { created: r.count };
}

/** Exams a user may take: assigned directly or via a group. */
export function assignedWhere(userId: string): Prisma.ExaminationWhereInput {
  return {
    assignments: { some: { OR: [{ userId }, { group: { members: { some: { userId } } } }] } },
  };
}
