import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db';
import { parse } from '../../lib/validate';
import { requireAuth } from '../../lib/auth';
import { audit } from '../../lib/audit';
import { paged } from '../../lib/http';
import { badRequest, notFound } from '../../lib/errors';
import { getResultDetail } from './results.service';
import { analytics, personalHistory, resultRowInclude, resultWhere, serializeResultRow, type ResultFilter } from './analytics.service';
import { analyticsPdf, resultPdf, resultsExcel, type ResultPdfData } from './reports';

const filterSchema = z.object({
  examId: z.string().max(64).optional(),
  userId: z.string().max(64).optional(),
  groupId: z.string().max(64).optional(),
  passed: z.enum(['true', 'false']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().max(100).optional(),
});
const toFilter = (f: z.infer<typeof filterSchema>): ResultFilter => ({ ...f, passed: f.passed === undefined ? undefined : f.passed === 'true' });
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const send = (reply: FastifyReply, buf: Buffer, type: string, name: string) =>
  reply.header('content-type', type).header('content-disposition', `attachment; filename="report"; filename*=UTF-8''${encodeURIComponent(name)}`).header('cache-control', 'no-store').send(buf);
const stamp = () => new Date().toISOString().slice(0, 10);

export async function resultsRoutes(app: FastifyInstance) {
  const staff = requireAuth('results.view_all');

  app.get('/results/attempts/:id', { preHandler: requireAuth('results.view_own', 'results.view_all') }, async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().min(1).max(64) }), req.params);
    reply.header('cache-control', 'no-store');
    return getResultDetail(req, id);
  });

  app.get('/results/attempts/:id/pdf', { preHandler: requireAuth('results.view_own', 'results.view_all'), config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().min(1).max(64) }), req.params);
    const d = await getResultDetail(req, id);
    if (!('summary' in d) || !d.summary) throw badRequest('Kết quả bài thi này chưa được công bố');
    const pdf = await resultPdf(d as unknown as ResultPdfData);
    return send(reply, pdf, 'application/pdf', `ket-qua-${(d as { candidate: { username: string } }).candidate.username}-${stamp()}.pdf`);
  });

  app.get('/results', { preHandler: staff }, async (req) => {
    const q = parse(filterSchema.extend({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(20) }), req.query);
    const where = resultWhere(toFilter(q));
    const [items, total] = await Promise.all([
      prisma.examinationResult.findMany({ where, include: resultRowInclude, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.examinationResult.count({ where }),
    ]);
    return paged(items.map((r) => { const { byCategory: _b, ...rest } = serializeResultRow(r); return rest; }), total, q.page, q.pageSize);
  });

  app.get('/results/export.xlsx', { preHandler: requireAuth('results.export'), config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const f = toFilter(parse(filterSchema, req.query));
    const rows = (await prisma.examinationResult.findMany({ where: resultWhere(f), include: resultRowInclude, orderBy: { createdAt: 'desc' }, take: 20000 })).map(serializeResultRow);
    const buf = await resultsExcel(rows, await analytics(f));
    await audit(req, 'results.export', 'results', null, { format: 'xlsx', count: rows.length, filter: f });
    return send(reply, Buffer.from(buf as ArrayBuffer), XLSX, `ket-qua-thi-${stamp()}.xlsx`);
  });

  app.get('/analytics', { preHandler: requireAuth('results.view_all', 'exams.view_stats') }, async (req) => analytics(toFilter(parse(filterSchema, req.query))));

  app.get('/analytics/report.pdf', { preHandler: requireAuth('results.export'), config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const f = toFilter(parse(filterSchema, req.query));
    let title = 'Toàn bộ kỳ thi';
    if (f.examId) {
      const e = await prisma.examination.findUnique({ where: { id: f.examId }, select: { name: true, code: true } });
      if (!e) throw notFound();
      title = `${e.name} (${e.code})`;
    }
    if (f.groupId) title += ` · Nhóm: ${(await prisma.userGroup.findUnique({ where: { id: f.groupId } }))?.name ?? ''}`;
    const pdf = await analyticsPdf(title, await analytics(f));
    await audit(req, 'results.export', 'results', null, { format: 'pdf', filter: f });
    return send(reply, pdf, 'application/pdf', `bao-cao-nang-luc-${stamp()}.pdf`);
  });

  app.get('/my/results', { preHandler: requireAuth('results.view_own') }, async (req) => personalHistory(req.user!.id));

  /** Individual history for staff (employee report). */
  app.get('/users/:id/results', { preHandler: staff }, async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1).max(64) }), req.params);
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, fullName: true, username: true, department: true, position: true } });
    if (!user) throw notFound();
    const a = await analytics({ userId: id });
    return { user, ...a };
  });
}
