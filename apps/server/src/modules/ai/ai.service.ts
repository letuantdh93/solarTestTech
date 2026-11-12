/**
 * AI-assisted authoring. Every AI output is treated as untrusted:
 *  - generated questions are normalised, schema-validated and saved as DRAFT (isAiGenerated);
 *  - calculation answer keys are recomputed by the server (verifyCalculation);
 *  - results and verification reports are returned to the author for review.
 */
import type { FastifyRequest } from 'fastify';
import type * as z from 'zod/v4';
import { questionInputSchema, verifyCalculation, checkQuestionQuality, computeCalcSpec, type QuestionInput } from '@solar/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { AppError, badRequest } from '../../lib/errors';
import { createQuestion, getQuestion, toInput } from '../questions/questions.service';
import { getSettings } from '../settings/settings.service';
import { getProvider, AiError, type StructuredRequest } from './providers';
import { aiDistractors, aiExplanation, aiQuestionSet, aiReview, type AiQuestion } from './ai.schemas';
import * as P from './ai.prompts';

async function ensureEnabled() {
  const s = await getSettings();
  if (!s.aiEnabled) throw new AppError(403, 'Tính năng AI đang tắt trong cấu hình hệ thống.', 'AI_DISABLED');
  const p = getProvider();
  if (!p.isConfigured()) throw new AppError(503, 'Chưa cấu hình khóa API cho nhà cung cấp AI (ANTHROPIC_API_KEY).', 'AI_NOT_CONFIGURED');
  return { provider: p, model: s.aiModel };
}

/** Run a provider call and record it in ai_generation_jobs. */
async function runJob<S extends z.ZodType>(req: FastifyRequest, kind: string, input: Record<string, unknown>, call: Omit<StructuredRequest<S>, 'model'>) {
  const { provider, model } = await ensureEnabled();
  const job = await prisma.aiGenerationJob.create({ data: { userId: req.user!.id, kind, provider: provider.name, model, status: 'RUNNING', input: input as never } });
  try {
    const res = await provider.generateStructured({ ...call, model });
    return { job, res };
  } catch (e) {
    const msg = e instanceof AiError ? e.message : 'Lỗi không xác định khi gọi AI';
    await prisma.aiGenerationJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: msg, finishedAt: new Date() } });
    throw new AppError(e instanceof AiError && e.code === 'RATE_LIMIT' ? 429 : 502, msg, e instanceof AiError ? `AI_${e.code}` : 'AI_ERROR');
  }
}

async function finishJob(jobId: string, res: { model: string; inputTokens: number | null; outputTokens: number | null; data: unknown }, createdQuestionIds: string[] = []) {
  await prisma.aiGenerationJob.update({
    where: { id: jobId },
    data: { status: 'SUCCEEDED', model: res.model, output: res.data as never, inputTokens: res.inputTokens, outputTokens: res.outputTokens, createdQuestionIds, finishedAt: new Date() },
  });
}

/** Convert an AI question into our input shape (normalising the variable list). */
export function aiToInput(q: AiQuestion, categoryId: string, subcategoryId: string | null): QuestionInput {
  const tags = [...new Set([...q.tags.map((t) => t.toLowerCase().trim()).filter(Boolean), 'ai'])].slice(0, 30);
  const type = q.type;
  const options = type === 'NUMERIC' ? [] : type === 'TRUE_FALSE' ? q.options.slice(0, 2).map((o, i) => ({ ...o, label: i === 0 ? 'Đúng' : 'Sai' })) : q.options.slice(0, 8);
  const refs: QuestionInput['references'] = q.references.slice(0, 10).map((r) => ({ standard: r.standard, edition: r.edition, jurisdiction: null, clause: null, title: null, note: r.note, verified: false }));
  if (q.manufacturerSpecific) refs.push({ standard: 'Datasheet nhà sản xuất', edition: null, jurisdiction: 'Theo thiết bị', clause: null, title: null, note: 'Đáp án phụ thuộc thông số nhà sản xuất', verified: false });
  return {
    title: q.title.slice(0, 300),
    content: q.content,
    type,
    categoryId,
    subcategoryId,
    difficulty: Math.min(4, Math.max(1, Math.round(q.difficulty))),
    calcComplexity: Math.min(3, Math.max(0, Math.round(q.calcComplexity))),
    isCalculation: q.isCalculation,
    isScenario: q.isScenario,
    assumptions: q.assumptions || null,
    explanation: q.explanation || null,
    calcMethod: q.calcMethod,
    conceptKey: q.conceptKey ? q.conceptKey.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 120) : null,
    tags,
    options: options.map((o) => ({ label: o.label, isCorrect: o.isCorrect, numericValue: o.numericValue, rationale: o.rationale || null })),
    numericAnswer: type === 'NUMERIC' ? q.numericAnswer : null,
    numericUnit: q.numericUnit,
    numericTolerance: q.numericTolerance,
    toleranceType: q.toleranceType,
    numericDecimals: type === 'NUMERIC' ? 2 : null,
    calcSpec: q.calcSpec ? { expression: q.calcSpec.expression, variables: Object.fromEntries(q.calcSpec.variables.map((v) => [v.name, v.value])), unit: q.calcSpec.unit ?? undefined } : null,
    references: refs,
    changeNote: 'Tạo bởi trợ lý AI – cần rà soát',
  };
}

async function saveDrafts(req: FastifyRequest, questions: AiQuestion[], categoryId: string, subcategoryId: string | null) {
  const out = [];
  for (const q of questions) {
    const input = aiToInput(q, categoryId, subcategoryId);
    const parsed = questionInputSchema.safeParse(input);
    if (!parsed.success) {
      out.push({ title: q.title, saved: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      continue;
    }
    const verification = verifyCalculation(parsed.data);
    const issues = checkQuestionQuality(parsed.data);
    if (parsed.data.isCalculation && !parsed.data.calcSpec)
      issues.push({ code: 'AI_NO_CALCSPEC', severity: 'error', message: 'Câu hỏi tính toán do AI tạo thiếu đặc tả tính toán – không thể kiểm chứng đáp án' });
    const created = await createQuestion(req, parsed.data, { isAiGenerated: true });
    out.push({ id: created.id, code: created.code, title: created.title, saved: true, verification, issues });
  }
  return out;
}

async function categoryInfo(categoryId: string, subcategoryId?: string | null) {
  const cat = await prisma.questionCategory.findUnique({ where: { id: categoryId } });
  if (!cat || cat.parentId) throw badRequest('Lĩnh vực không hợp lệ');
  const sub = subcategoryId ? await prisma.questionCategory.findUnique({ where: { id: subcategoryId } }) : null;
  if (subcategoryId && (!sub || sub.parentId !== cat.id)) throw badRequest('Chủ đề không thuộc lĩnh vực');
  return { cat, sub };
}

export async function generateQuestions(req: FastifyRequest, p: { categoryId: string; subcategoryId?: string | null; difficulty: number; type: string; count: number; topic?: string; requireCalculation: boolean; requireScenario: boolean }) {
  const { cat, sub } = await categoryInfo(p.categoryId, p.subcategoryId);
  const existing = await prisma.question.findMany({ where: { categoryId: cat.id, status: { not: 'ARCHIVED' } }, select: { title: true }, take: 60, orderBy: { updatedAt: 'desc' } });
  const { job, res } = await runJob(req, 'GENERATE_QUESTIONS', p, {
    task: 'generate',
    system: P.INTEGRITY_RULES,
    user: P.generatePrompt({ category: `${cat.code}. ${cat.name}`, subcategory: sub?.name, difficulty: p.difficulty, type: p.type, count: p.count, topic: p.topic, requireCalculation: p.requireCalculation, requireScenario: p.requireScenario, avoidTitles: existing.map((e) => e.title) }),
    schema: aiQuestionSet,
    effort: 'high',
  });
  const results = await saveDrafts(req, res.data.questions.slice(0, p.count), cat.id, sub?.id ?? null);
  await finishJob(job.id, res, results.filter((r) => r.saved).map((r) => r.id!));
  await audit(req, 'ai.job', 'ai', job.id, { kind: 'GENERATE_QUESTIONS', created: results.filter((r) => r.saved).length });
  return { jobId: job.id, results };
}

export async function documentToQuestions(req: FastifyRequest, p: { categoryId: string; text: string; count: number; difficulty: number }) {
  const { cat } = await categoryInfo(p.categoryId);
  const { job, res } = await runJob(req, 'DOCUMENT_TO_QUESTIONS', { ...p, text: `${p.text.slice(0, 200)}… (${p.text.length} ký tự)` }, {
    task: 'document',
    system: P.INTEGRITY_RULES,
    user: P.documentPrompt({ category: `${cat.code}. ${cat.name}`, difficulty: p.difficulty, count: p.count, text: p.text }),
    schema: aiQuestionSet,
    effort: 'high',
  });
  const results = await saveDrafts(req, res.data.questions.slice(0, p.count), cat.id, null);
  await finishJob(job.id, res, results.filter((r) => r.saved).map((r) => r.id!));
  await audit(req, 'ai.job', 'ai', job.id, { kind: 'DOCUMENT_TO_QUESTIONS' });
  return { jobId: job.id, results };
}

/** Prepare a question for the AI without leaking internal ids. */
async function questionForAi(req: FastifyRequest, id: string) {
  const q = await getQuestion(req, id);
  const i = toInput(q);
  return { q, payload: { ...i, categoryId: undefined, subcategoryId: undefined, category: `${q.category.code}. ${q.category.name}`, options: i.options.map(({ id: _id, ...o }) => o) } };
}

export async function reviewQuestion(req: FastifyRequest, id: string) {
  const { q, payload } = await questionForAi(req, id);
  const { job, res } = await runJob(req, 'REVIEW_QUESTION', { questionId: id }, { task: 'review', system: P.INTEGRITY_RULES, user: P.reviewPrompt(payload), schema: aiReview, effort: 'high' });
  // Programmatic cross-check of the AI's independent calculation against the stored key.
  const system = verifyCalculation(toInput(q));
  let aiCalc: { value: number | null; error?: string } = { value: null };
  const ic = res.data.independentCalculation;
  if (ic.performed && ic.expression) {
    try {
      aiCalc = { value: computeCalcSpec({ expression: ic.expression, variables: Object.fromEntries(ic.variables.map((v) => [v.name, v.value])) }) };
    } catch (e) {
      aiCalc = { value: null, error: (e as Error).message };
    }
  }
  await finishJob(job.id, res);
  return { jobId: job.id, review: res.data, systemVerification: system, aiCalculation: aiCalc };
}

export async function suggestDistractors(req: FastifyRequest, id: string, count = 3) {
  const { payload } = await questionForAi(req, id);
  const { job, res } = await runJob(req, 'GENERATE_DISTRACTORS', { questionId: id, count }, { task: 'distractors', system: P.INTEGRITY_RULES, user: P.distractorPrompt(payload, count), schema: aiDistractors, effort: 'medium' });
  await finishJob(job.id, res);
  return { jobId: job.id, ...res.data };
}

export async function suggestExplanation(req: FastifyRequest, id: string) {
  const { payload } = await questionForAi(req, id);
  const { job, res } = await runJob(req, 'GENERATE_EXPLANATION', { questionId: id }, { task: 'explanation', system: P.INTEGRITY_RULES, user: P.explanationPrompt(payload), schema: aiExplanation, effort: 'medium' });
  await finishJob(job.id, res);
  return { jobId: job.id, ...res.data };
}

export async function generateVariants(req: FastifyRequest, id: string, count: number) {
  const { q, payload } = await questionForAi(req, id);
  const { job, res } = await runJob(req, 'GENERATE_VARIANTS', { questionId: id, count }, { task: 'variants', system: P.INTEGRITY_RULES, user: P.variantPrompt(payload, count), schema: aiQuestionSet, effort: 'high' });
  const results = await saveDrafts(req, res.data.questions.slice(0, count).map((v) => ({ ...v, conceptKey: q.conceptKey ?? v.conceptKey })), q.categoryId, q.subcategoryId);
  await finishJob(job.id, res, results.filter((r) => r.saved).map((r) => r.id!));
  return { jobId: job.id, results };
}

export async function listJobs(req: FastifyRequest, page: number, pageSize: number) {
  const where = req.user!.permissions.has('settings.manage') ? {} : { userId: req.user!.id };
  const [items, total] = await Promise.all([
    prisma.aiGenerationJob.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { user: { select: { fullName: true } } } }),
    prisma.aiGenerationJob.count({ where }),
  ]);
  return { items: items.map(({ output: _o, ...rest }) => rest), total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function aiStatus() {
  const s = await getSettings();
  const p = getProvider();
  return { enabled: s.aiEnabled, configured: p.isConfigured(), provider: p.name, model: s.aiModel };
}

