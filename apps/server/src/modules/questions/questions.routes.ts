import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  questionInputSchema,
  questionListQuerySchema,
  questionStatusChangeSchema,
  CALC_TEMPLATES,
  computeCalcSpec,
  calcSpecSchema,
} from '@solar/shared';
import { prisma } from '../../db';
import { parse } from '../../lib/validate';
import { requireAuth, hasPerm } from '../../lib/auth';
import { audit } from '../../lib/audit';
import { badRequest } from '../../lib/errors';
import * as svc from './questions.service';
import { buildTemplate, exportQuestions, importQuestions } from './questions.excel';

const idParam = z.object({ id: z.string().min(1).max(64) });
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const disposition = (name: string) => `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`;

export async function questionsRoutes(app: FastifyInstance) {
  const staffOrAuthor = requireAuth('questions.view_all', 'questions.create', 'questions.review', 'questions.edit_all');

  app.get('/questions', { preHandler: staffOrAuthor }, async (req) => svc.listQuestions(req, parse(questionListQuerySchema, req.query)));

  app.get('/questions/calc-templates', { preHandler: staffOrAuthor }, async () => CALC_TEMPLATES);

  app.post('/questions/calc-evaluate', { preHandler: staffOrAuthor }, async (req) => {
    const spec = parse(calcSpecSchema, req.body);
    try {
      return { value: computeCalcSpec(spec) };
    } catch (e) {
      throw badRequest((e as Error).message);
    }
  });

  /** Live quality check + calculation verification + similar questions (used by the editor). */
  app.post('/questions/check', { preHandler: staffOrAuthor }, async (req) => {
    const body = req.body as { input?: unknown; excludeId?: string };
    const input = parse(questionInputSchema, body?.input);
    const report = svc.qualityReport(input);
    const similar = await svc.findSimilar(`${input.content}`, { excludeId: typeof body.excludeId === 'string' ? body.excludeId : undefined });
    return { ...report, similar };
  });

  app.get('/questions/:id', { preHandler: staffOrAuthor }, async (req) => {
    const { id } = parse(idParam, req.params);
    const q = await svc.getQuestion(req, id);
    const [reviewLogs, revisions, usage] = await Promise.all([
      prisma.questionReviewLog.findMany({ where: { questionId: id }, orderBy: { createdAt: 'desc' }, include: { actor: { select: { fullName: true } } } }),
      prisma.questionRevision.findMany({ where: { questionId: id }, orderBy: { version: 'desc' }, select: { id: true, version: true, changeNote: true, createdAt: true, changedBy: { select: { fullName: true } } } }),
      prisma.examinationQuestion.count({ where: { questionId: id } }),
    ]);
    return { question: svc.serializeQuestion(q), quality: svc.qualityReport(svc.toInput(q)), reviewLogs, revisions, usage };
  });

  app.get('/questions/:id/revisions/:version', { preHandler: staffOrAuthor }, async (req) => {
    const { id, version } = parse(z.object({ id: z.string(), version: z.coerce.number().int().min(1) }), req.params);
    await svc.getQuestion(req, id); // visibility check
    return prisma.questionRevision.findUniqueOrThrow({ where: { questionId_version: { questionId: id, version } } });
  });

  app.post('/questions/:id/revisions/:version/restore', { preHandler: requireAuth('questions.create', 'questions.edit_all') }, async (req) => {
    const { id, version } = parse(z.object({ id: z.string(), version: z.coerce.number().int().min(1) }), req.params);
    const q = await svc.restoreRevision(req, id, version);
    await audit(req, 'question.restore', 'question', id, { version });
    return svc.serializeQuestion(q);
  });

  app.post('/questions', { preHandler: requireAuth('questions.create', 'questions.edit_all') }, async (req, reply) => {
    const q = await svc.createQuestion(req, parse(questionInputSchema, req.body));
    reply.code(201);
    return svc.serializeQuestion(q);
  });

  app.put('/questions/:id', { preHandler: requireAuth('questions.create', 'questions.edit_all') }, async (req) => {
    const { id } = parse(idParam, req.params);
    return svc.serializeQuestion(await svc.updateQuestion(req, id, parse(questionInputSchema, req.body)));
  });

  app.post('/questions/:id/status', { preHandler: staffOrAuthor }, async (req) => {
    const { id } = parse(idParam, req.params);
    const { status, comment } = parse(questionStatusChangeSchema, req.body);
    return svc.serializeQuestion(await svc.changeStatus(req, id, status, comment));
  });

  app.post('/questions/bulk-status', { preHandler: requireAuth('questions.review') }, async (req) => {
    const { ids, status, comment } = parse(
      z.object({ ids: z.array(z.string()).min(1).max(200), status: questionStatusChangeSchema.shape.status, comment: z.string().max(2000).optional() }),
      req.body,
    );
    const results: Array<{ id: string; ok: boolean; message?: string }> = [];
    for (const id of ids) {
      try {
        await svc.changeStatus(req, id, status, comment);
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, message: (e as Error).message });
      }
    }
    return { results };
  });

  app.post('/questions/:id/duplicate', { preHandler: requireAuth('questions.create', 'questions.edit_all') }, async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const q = await svc.duplicateQuestion(req, id);
    await audit(req, 'question.duplicate', 'question', q.id, { from: id });
    reply.code(201);
    return svc.serializeQuestion(q);
  });

  app.delete('/questions/:id', { preHandler: requireAuth('questions.create', 'questions.delete') }, async (req) => {
    const { id } = parse(idParam, req.params);
    await svc.deleteQuestion(req, id);
    return { ok: true };
  });

  // ── Excel ──
  app.get('/questions/excel/template', { preHandler: requireAuth('questions.import', 'questions.create') }, async (_req, reply) => {
    const buf = await buildTemplate();
    reply.header('content-type', XLSX).header('content-disposition', disposition('mau-nhap-cau-hoi.xlsx'));
    return reply.send(Buffer.from(buf as ArrayBuffer));
  });

  app.get('/questions/excel/export', { preHandler: requireAuth('questions.export') }, async (req, reply) => {
    const q = parse(questionListQuerySchema.partial(), req.query);
    const where = {
      AND: [
        await svc.visibilityFilter(req),
        q.categoryId ? { OR: [{ categoryId: q.categoryId }, { subcategoryId: q.categoryId }] } : {},
        q.status ? { status: q.status } : {},
        q.difficulty ? { difficulty: q.difficulty } : {},
        q.type ? { type: q.type } : {},
      ],
    };
    const { buffer, count } = await exportQuestions(where);
    await audit(req, 'question.export', 'question', null, { count, filters: q });
    const date = new Date().toISOString().slice(0, 10);
    reply.header('content-type', XLSX).header('content-disposition', disposition(`ngan-hang-cau-hoi-${date}.xlsx`));
    return reply.send(Buffer.from(buffer as ArrayBuffer));
  });

  app.post('/questions/excel/import', { preHandler: requireAuth('questions.import'), config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const dryRun = (req.query as { dryRun?: string }).dryRun !== 'false';
    const file = await req.file();
    if (!file) throw badRequest('Chưa chọn tệp');
    if (!/\.xlsx$/i.test(file.filename)) throw badRequest('Chỉ chấp nhận tệp .xlsx');
    const buf = await file.toBuffer();
    if (buf.subarray(0, 2).toString('ascii') !== 'PK') throw badRequest('Tệp không đúng định dạng .xlsx');
    const result = await importQuestions(req, buf, dryRun);
    if (!dryRun) await audit(req, 'question.import', 'question', null, { total: result.total, ok: result.ok, errors: result.errors, skipped: result.skipped });
    return result;
  });

  // ── Tags (for filter suggestions) ──
  app.get('/questions-meta/tags', { preHandler: staffOrAuthor }, async (req) => {
    const where = await svc.visibilityFilter(req);
    const rows = await prisma.question.findMany({ where, select: { tags: true }, take: 5000 });
    const counts = new Map<string, number>();
    for (const r of rows) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100).map(([tag, count]) => ({ tag, count }));
  });

  app.get('/questions-meta/authors', { preHandler: requireAuth('questions.view_all', 'questions.review') }, async () => {
    return prisma.user.findMany({ where: { questionsAuthored: { some: {} } }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } });
  });

  // Reviewer queue
  app.get('/questions-review/pending', { preHandler: requireAuth('questions.review') }, async (req) => {
    const items = await prisma.question.findMany({
      where: { status: 'PENDING_REVIEW' },
      include: svc.questionInclude,
      orderBy: { updatedAt: 'asc' },
      take: 200,
    });
    return items.map((q) => ({ ...svc.serializeQuestion(q), quality: svc.qualityReport(svc.toInput(q)), isOwn: q.authorId === req.user!.id && !hasPerm(req, 'users.manage') }));
  });
}
