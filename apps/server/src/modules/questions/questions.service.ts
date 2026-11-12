import type { FastifyRequest } from 'fastify';
import { Prisma, type QuestionStatus } from '@prisma/client';
import {
  QUESTION_TRANSITIONS,
  checkQuestionQuality,
  hasBlockingIssues,
  verifyCalculation,
  textSimilarity,
  type QuestionInput,
  questionListQuerySchema,
} from '@solar/shared';
import type { z } from 'zod';
import { prisma, type Tx } from '../../db';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { hasPerm } from '../../lib/auth';
import { paged, dec } from '../../lib/http';
import { audit } from '../../lib/audit';
import { getSettings } from '../settings/settings.service';

export const questionInclude = {
  options: { orderBy: { sortOrder: 'asc' } },
  references: true,
  media: { orderBy: { sortOrder: 'asc' } },
  category: { select: { id: true, code: true, name: true } },
  subcategory: { select: { id: true, code: true, name: true } },
  author: { select: { id: true, fullName: true } },
  reviewer: { select: { id: true, fullName: true } },
} satisfies Prisma.QuestionInclude;

export type QuestionFull = Prisma.QuestionGetPayload<{ include: typeof questionInclude }>;

/** API representation (Decimal -> number). Contains answer keys: only for staff endpoints. */
export function serializeQuestion(q: QuestionFull) {
  return {
    ...q,
    numericAnswer: dec(q.numericAnswer),
    numericTolerance: dec(q.numericTolerance),
    options: q.options.map((o) => ({ ...o, numericValue: dec(o.numericValue) })),
    media: q.media.map((m) => ({ ...m, url: `/api/media/${m.id}` })),
  };
}

/** Normalised input shape (used for quality checks and revisions). */
export function toInput(q: QuestionFull): QuestionInput {
  return {
    title: q.title,
    content: q.content,
    type: q.type,
    categoryId: q.categoryId,
    subcategoryId: q.subcategoryId,
    difficulty: q.difficulty,
    calcComplexity: q.calcComplexity,
    isCalculation: q.isCalculation,
    isScenario: q.isScenario,
    assumptions: q.assumptions,
    explanation: q.explanation,
    calcMethod: q.calcMethod,
    conceptKey: q.conceptKey,
    tags: q.tags,
    options: q.options.map((o) => ({ id: o.id, label: o.label, isCorrect: o.isCorrect, numericValue: dec(o.numericValue), rationale: o.rationale })),
    numericAnswer: dec(q.numericAnswer),
    numericUnit: q.numericUnit,
    numericTolerance: dec(q.numericTolerance),
    toleranceType: q.toleranceType,
    numericDecimals: q.numericDecimals,
    calcSpec: (q.calcSpec as QuestionInput['calcSpec']) ?? null,
    references: q.references.map((r) => ({ standard: r.standard, edition: r.edition, jurisdiction: r.jurisdiction, clause: r.clause, title: r.title, note: r.note, verified: r.verified })),
  };
}

// ───────────── Access rules ─────────────

async function authorCategoryIds(userId: string) {
  const rows = await prisma.authorCategory.findMany({ where: { userId }, select: { categoryId: true } });
  return rows.map((r) => r.categoryId);
}

/** Visibility: staff with view_all see everything; authors see their own questions. */
export async function visibilityFilter(req: FastifyRequest): Promise<Prisma.QuestionWhereInput> {
  if (hasPerm(req, 'questions.view_all') || hasPerm(req, 'questions.review') || hasPerm(req, 'questions.edit_all')) return {};
  if (hasPerm(req, 'questions.create')) return { authorId: req.user!.id };
  throw forbidden();
}

async function assertCanEdit(req: FastifyRequest, q: { authorId: string; status: QuestionStatus; categoryId: string }) {
  if (hasPerm(req, 'questions.edit_all')) return;
  if (!hasPerm(req, 'questions.create') || q.authorId !== req.user!.id) throw forbidden('Bạn chỉ có thể sửa câu hỏi do mình soạn');
  if (q.status !== 'DRAFT') throw forbidden('Chỉ có thể sửa câu hỏi ở trạng thái Bản nháp. Câu hỏi đã gửi duyệt sẽ được trả lại nếu cần chỉnh sửa.');
}

async function assertCategoryAllowed(req: FastifyRequest, categoryId: string, subcategoryId?: string | null) {
  const cat = await prisma.questionCategory.findUnique({ where: { id: categoryId } });
  if (!cat || cat.parentId) throw badRequest('Lĩnh vực không hợp lệ');
  if (!cat.isActive) throw badRequest('Lĩnh vực đang ngừng sử dụng');
  if (subcategoryId) {
    const sub = await prisma.questionCategory.findUnique({ where: { id: subcategoryId } });
    if (!sub || sub.parentId !== categoryId) throw badRequest('Chủ đề không thuộc lĩnh vực đã chọn');
  }
  if (!hasPerm(req, 'questions.edit_all')) {
    const allowed = await authorCategoryIds(req.user!.id);
    if (!allowed.includes(categoryId)) throw forbidden('Bạn chưa được phân công biên soạn lĩnh vực này');
  }
}

// ───────────── Queries ─────────────

export async function listQuestions(req: FastifyRequest, q: z.infer<typeof questionListQuerySchema>) {
  const and: Prisma.QuestionWhereInput[] = [await visibilityFilter(req)];
  if (q.categoryId) and.push({ OR: [{ categoryId: q.categoryId }, { subcategoryId: q.categoryId }] });
  if (q.difficulty) and.push({ difficulty: q.difficulty });
  if (q.type) and.push({ type: q.type });
  if (q.status) and.push({ status: q.status });
  else and.push({ status: { not: 'ARCHIVED' } });
  if (q.authorId) and.push({ authorId: q.authorId });
  if (q.isCalculation) and.push({ isCalculation: q.isCalculation === 'true' });
  if (q.isScenario) and.push({ isScenario: q.isScenario === 'true' });
  if (q.tag) and.push({ tags: { has: q.tag } });
  if (q.q) {
    const term = q.q.trim();
    and.push({
      OR: [
        { code: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { content: { contains: term, mode: 'insensitive' } },
        { tags: { has: term.toLowerCase() } },
      ],
    });
  }
  const where: Prisma.QuestionWhereInput = { AND: and };
  const [items, total] = await Promise.all([
    prisma.question.findMany({
      where,
      orderBy: { [q.sort]: q.dir },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true, code: true, title: true, type: true, difficulty: true, calcComplexity: true, isCalculation: true, isScenario: true,
        status: true, tags: true, version: true, isAiGenerated: true, updatedAt: true, createdAt: true, conceptKey: true,
        category: { select: { id: true, code: true, name: true } },
        subcategory: { select: { id: true, code: true, name: true } },
        author: { select: { id: true, fullName: true } },
        _count: { select: { media: true, examQuestions: true } },
      },
    }),
    prisma.question.count({ where }),
  ]);
  return paged(items, total, q.page, q.pageSize);
}

export async function getQuestion(req: FastifyRequest, id: string) {
  const q = await prisma.question.findFirst({ where: { AND: [{ id }, await visibilityFilter(req)] }, include: questionInclude });
  if (!q) throw notFound('Không tìm thấy câu hỏi');
  return q;
}

// ───────────── Mutations ─────────────

async function nextCode(tx: Tx, categoryCode: string) {
  // Numeric max (not lexical) so codes of any digit width sort correctly.
  const prefix = `PV-${categoryCode}-`;
  const rows = await tx.$queryRaw<Array<{ n: number | null }>>(Prisma.sql`
    SELECT MAX(CAST(substring(code from ${prefix.length + 1}::int) AS INTEGER)) AS n
    FROM questions WHERE code LIKE ${prefix + '%'} AND substring(code from ${prefix.length + 1}::int) ~ '^[0-9]+$'`);
  const n = Number(rows[0]?.n ?? 0);
  return `${prefix}${String(n + 1).padStart(4, '0')}`;
}

/** Retry a transaction when a concurrent insert grabbed the same question code. */
async function withCodeRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i < attempts - 1 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
}

function normaliseInput(input: QuestionInput): QuestionInput {
  const out = { ...input, tags: [...new Set(input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))] };
  if (out.type === 'TRUE_FALSE' && out.options.length === 0) {
    out.options = [
      { label: 'Đúng', isCorrect: false },
      { label: 'Sai', isCorrect: false },
    ];
  }
  if (out.type === 'NUMERIC') out.options = [];
  if (out.type !== 'NUMERIC') {
    out.numericAnswer = null;
    // Tolerance is still needed to verify numeric option values against calcSpec.
    if (!out.calcSpec) {
      out.numericTolerance = null;
      out.toleranceType = null;
    }
  } else {
    out.toleranceType = out.toleranceType ?? 'RELATIVE';
  }
  return out;
}

function scalarData(input: QuestionInput) {
  return {
    title: input.title,
    content: input.content,
    type: input.type,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId ?? null,
    difficulty: input.difficulty,
    calcComplexity: input.calcComplexity,
    isCalculation: input.isCalculation,
    isScenario: input.isScenario,
    assumptions: input.assumptions ?? null,
    explanation: input.explanation ?? null,
    calcMethod: input.calcMethod ?? null,
    conceptKey: input.conceptKey ?? null,
    tags: input.tags,
    numericAnswer: input.numericAnswer ?? null,
    numericUnit: input.numericUnit ?? null,
    numericTolerance: input.numericTolerance ?? null,
    toleranceType: input.toleranceType ?? null,
    numericDecimals: input.numericDecimals ?? null,
    calcSpec: input.calcSpec ? (input.calcSpec as Prisma.InputJsonValue) : Prisma.JsonNull,
  };
}

async function writeRevision(tx: Tx, questionId: string, actorId: string, note?: string) {
  const q = await tx.question.findUniqueOrThrow({ where: { id: questionId }, include: questionInclude });
  await tx.questionRevision.create({
    data: { questionId, version: q.version, snapshot: JSON.parse(JSON.stringify(serializeQuestion(q))), changeNote: note ?? null, changedById: actorId },
  });
  return q;
}

async function linkMedia(tx: Tx, questionId: string, content: string, actorId: string) {
  // Attach uploaded media referenced in the content (/api/media/<id>) and owned by the actor.
  const ids = [...content.matchAll(/\/api\/media\/([a-z0-9]{20,40})/g)].map((m) => m[1]!);
  if (ids.length)
    await tx.questionMedia.updateMany({ where: { id: { in: ids }, OR: [{ questionId: null, uploadedById: actorId }, { questionId }] }, data: { questionId } });
}

export async function createQuestion(req: FastifyRequest, raw: QuestionInput, extra: { isAiGenerated?: boolean } = {}) {
  const input = normaliseInput(raw);
  await assertCategoryAllowed(req, input.categoryId, input.subcategoryId);
  const cat = await prisma.questionCategory.findUniqueOrThrow({ where: { id: input.categoryId } });
  const q = await withCodeRetry(() => prisma.$transaction(async (tx) => {
    const created = await tx.question.create({
      data: {
        ...scalarData(input),
        code: await nextCode(tx, cat.code),
        status: 'DRAFT',
        authorId: req.user!.id,
        isAiGenerated: extra.isAiGenerated ?? false,
        options: { create: input.options.map((o, i) => ({ label: o.label, isCorrect: o.isCorrect, numericValue: o.numericValue ?? null, rationale: o.rationale ?? null, sortOrder: i })) },
        references: { create: input.references.map((r) => ({ ...r, verified: r.verified ?? false })) },
      },
    });
    await linkMedia(tx, created.id, input.content, req.user!.id);
    const full = await writeRevision(tx, created.id, req.user!.id, raw.changeNote ?? 'Tạo mới');
    await audit(req, 'question.create', 'question', created.id, { code: created.code, ai: extra.isAiGenerated ?? false }, tx);
    return full;
  }));
  return q;
}

export async function updateQuestion(req: FastifyRequest, id: string, raw: QuestionInput) {
  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) throw notFound('Không tìm thấy câu hỏi');
  await assertCanEdit(req, existing);
  const input = normaliseInput(raw);
  if (input.categoryId !== existing.categoryId || input.subcategoryId !== existing.subcategoryId)
    await assertCategoryAllowed(req, input.categoryId, input.subcategoryId);

  // Editing an approved/published question invalidates its approval.
  const resetStatus = existing.status === 'APPROVED' || existing.status === 'PUBLISHED';
  return prisma.$transaction(async (tx) => {
    // Options are replaced; historical attempts keep their own snapshots so this is safe.
    await tx.questionOption.deleteMany({ where: { questionId: id } });
    await tx.questionReference.deleteMany({ where: { questionId: id } });
    await tx.question.update({
      where: { id },
      data: {
        ...scalarData(input),
        version: { increment: 1 },
        ...(resetStatus ? { status: 'DRAFT', approvedAt: null, reviewerId: null } : {}),
        options: { create: input.options.map((o, i) => ({ label: o.label, isCorrect: o.isCorrect, numericValue: o.numericValue ?? null, rationale: o.rationale ?? null, sortOrder: i })) },
        references: { create: input.references.map((r) => ({ ...r, verified: r.verified ?? false })) },
      },
    });
    if (resetStatus)
      await tx.questionReviewLog.create({
        data: { questionId: id, fromStatus: existing.status, toStatus: 'DRAFT', comment: 'Câu hỏi đã được chỉnh sửa – cần duyệt lại', actorId: req.user!.id },
      });
    await linkMedia(tx, id, input.content, req.user!.id);
    const full = await writeRevision(tx, id, req.user!.id, raw.changeNote);
    await audit(req, 'question.update', 'question', id, { version: full.version, statusReset: resetStatus }, tx);
    return full;
  });
}

export async function changeStatus(req: FastifyRequest, id: string, to: QuestionStatus, comment?: string) {
  const q = await prisma.question.findUnique({ where: { id }, include: questionInclude });
  if (!q) throw notFound('Không tìm thấy câu hỏi');
  const from = q.status;
  if (from === to) return q;
  if (!QUESTION_TRANSITIONS[from].includes(to))
    throw badRequest(`Không thể chuyển trạng thái từ "${from}" sang "${to}"`);

  const isOwner = q.authorId === req.user!.id;
  const reviewer = hasPerm(req, 'questions.review');
  // Who may perform which transition
  if (to === 'PENDING_REVIEW') {
    if (!isOwner && !hasPerm(req, 'questions.edit_all')) throw forbidden();
  } else if (to === 'APPROVED' || to === 'PUBLISHED' || (from === 'PENDING_REVIEW' && to === 'DRAFT')) {
    if (!reviewer) throw forbidden('Chỉ người có quyền duyệt mới thực hiện được thao tác này');
    if (to === 'APPROVED' && isOwner && !hasPerm(req, 'users.manage'))
      throw forbidden('Không thể tự duyệt câu hỏi do chính mình soạn');
    if (from === 'PENDING_REVIEW' && to === 'DRAFT' && !comment?.trim()) throw badRequest('Vui lòng nhập lý do trả lại');
  } else if (to === 'ARCHIVED' || (from === 'ARCHIVED' && to === 'DRAFT') || (from === 'APPROVED' && to === 'DRAFT') || (from === 'PUBLISHED' && to === 'DRAFT')) {
    if (!reviewer && !hasPerm(req, 'questions.edit_all') && !(isOwner && from === 'DRAFT')) throw forbidden();
  }

  // Quality gate before review/approval
  if (to === 'PENDING_REVIEW' || to === 'APPROVED' || to === 'PUBLISHED') {
    const issues = checkQuestionQuality(toInput(q));
    // AI-generated calculation questions must carry a verifiable calcSpec.
    if (q.isAiGenerated && q.isCalculation && !q.calcSpec)
      issues.push({ code: 'AI_NO_CALCSPEC', severity: 'error', message: 'Câu hỏi tính toán do AI tạo phải có đặc tả tính toán để kiểm chứng đáp án' });
    if (hasBlockingIssues(issues))
      throw new AppError(422, 'Câu hỏi chưa đạt yêu cầu chất lượng. Vui lòng khắc phục các lỗi trước khi tiếp tục.', 'QUALITY', issues.filter((i) => i.severity === 'error'));
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.question.update({
      where: { id },
      data: {
        status: to,
        ...(to === 'APPROVED' ? { approvedAt: new Date(), reviewerId: req.user!.id, reviewComment: comment ?? null } : {}),
        ...(from === 'PENDING_REVIEW' && to === 'DRAFT' ? { reviewerId: req.user!.id, reviewComment: comment ?? null } : {}),
        ...(to === 'ARCHIVED' ? { archivedAt: new Date() } : {}),
        ...(from === 'ARCHIVED' ? { archivedAt: null } : {}),
      },
      include: questionInclude,
    });
    await tx.questionReviewLog.create({ data: { questionId: id, fromStatus: from, toStatus: to, comment: comment ?? null, actorId: req.user!.id } });
    await audit(req, 'question.status', 'question', id, { from, to, comment }, tx);
    return updated;
  });
}

export async function duplicateQuestion(req: FastifyRequest, id: string) {
  const q = await getQuestion(req, id);
  const input = toInput(q);
  return createQuestion(req, { ...input, title: `${q.title} (bản sao)`, changeNote: `Nhân bản từ ${q.code}` }, { isAiGenerated: q.isAiGenerated });
}

export async function deleteQuestion(req: FastifyRequest, id: string) {
  const q = await prisma.question.findUnique({ where: { id }, include: { _count: { select: { examQuestions: true } } } });
  if (!q) throw notFound('Không tìm thấy câu hỏi');
  const canDelete = hasPerm(req, 'questions.delete') || (q.authorId === req.user!.id && q.status === 'DRAFT');
  if (!canDelete) throw forbidden();
  const used = q._count.examQuestions || (await prisma.attemptQuestion.count({ where: { questionId: id } }));
  if (used) throw conflict('Câu hỏi đã được sử dụng trong đề thi. Hãy lưu trữ thay vì xóa để bảo toàn dữ liệu lịch sử.');
  await prisma.$transaction(async (tx) => {
    await tx.question.delete({ where: { id } });
    await audit(req, 'question.delete', 'question', id, { code: q.code }, tx);
  });
}

export async function restoreRevision(req: FastifyRequest, id: string, version: number) {
  const rev = await prisma.questionRevision.findUnique({ where: { questionId_version: { questionId: id, version } } });
  if (!rev) throw notFound('Không tìm thấy phiên bản');
  const snap = rev.snapshot as unknown as QuestionFull & { options: Array<{ numericValue: number | null }> };
  const input: QuestionInput = {
    ...toInput({ ...(snap as QuestionFull), options: snap.options as never, references: snap.references, media: [] } as QuestionFull),
    changeNote: `Khôi phục phiên bản ${version}`,
  };
  return updateQuestion(req, id, input);
}

// ───────────── Similarity / duplicate detection ─────────────

export async function findSimilar(text: string, opts: { excludeId?: string; categoryId?: string; limit?: number } = {}) {
  const settings = await getSettings();
  const threshold = settings.similarityThreshold;
  const probe = text.slice(0, 4000);
  // Stage 1: trigram candidates from Postgres (fast, index-backed)
  const rows = await prisma.$queryRaw<Array<{ id: string; code: string; title: string; content: string; status: string; sim: number }>>(Prisma.sql`
    SELECT id, code, title, content, status::text AS status, similarity(content, ${probe}) AS sim
    FROM questions
    WHERE status <> 'ARCHIVED'
      ${opts.excludeId ? Prisma.sql`AND id <> ${opts.excludeId}` : Prisma.empty}
    ORDER BY content <-> ${probe}
    LIMIT 40`);
  // Stage 2: diacritic-insensitive shingle similarity, combined
  return rows
    .map((r) => {
      const shingle = textSimilarity(probe, r.content);
      const score = Math.max(shingle, Number(r.sim));
      return { id: r.id, code: r.code, title: r.title, status: r.status, score: Math.round(score * 100) / 100 };
    })
    .filter((r) => r.score >= Math.min(threshold, 0.95) * 0.75)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 8)
    .map((r) => ({ ...r, isDuplicate: r.score >= threshold }));
}

export function qualityReport(input: QuestionInput) {
  return { issues: checkQuestionQuality(input), verification: verifyCalculation(input) };
}
