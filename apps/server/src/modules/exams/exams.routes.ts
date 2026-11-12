import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { examInputSchema, generationConfigSchema, blueprintInputSchema, examQuestionsSetSchema, assignmentSchema, EXAM_STATUSES } from '@solar/shared';
import { prisma } from '../../db';
import { parse } from '../../lib/validate';
import { requireAuth } from '../../lib/auth';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { paged } from '../../lib/http';
import * as svc from './exams.service';

const idParam = z.object({ id: z.string().min(1).max(64) });

export async function examsRoutes(app: FastifyInstance) {
  const manage = requireAuth('exams.manage');
  const view = requireAuth('exams.manage', 'exams.assign', 'exams.view_stats');

  // ── Blueprints (matrix templates) ──
  app.get('/blueprints', { preHandler: view }, async () => {
    const rows = await prisma.examBlueprint.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], include: { createdBy: { select: { fullName: true } } } });
    return rows.map((b) => ({ ...b, passingScore: Number(b.passingScore) }));
  });
  app.post('/blueprints', { preHandler: manage }, async (req, reply) => {
    const body = parse(blueprintInputSchema, req.body);
    const b = await prisma.examBlueprint.create({ data: { ...body, config: body.config as Prisma.InputJsonValue, createdById: req.user!.id } });
    await audit(req, 'blueprint.save', 'blueprint', b.id, { name: b.name });
    reply.code(201);
    return { ...b, passingScore: Number(b.passingScore) };
  });
  app.put('/blueprints/:id', { preHandler: manage }, async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(blueprintInputSchema, req.body);
    const b = await prisma.examBlueprint.update({ where: { id }, data: { ...body, config: body.config as Prisma.InputJsonValue } });
    await audit(req, 'blueprint.save', 'blueprint', id, { name: b.name });
    return { ...b, passingScore: Number(b.passingScore) };
  });
  app.delete('/blueprints/:id', { preHandler: manage }, async (req) => {
    const { id } = parse(idParam, req.params);
    const b = await prisma.examBlueprint.findUnique({ where: { id } });
    if (!b) throw notFound();
    if (b.isDefault) throw notFound('Không thể xóa mẫu mặc định');
    await prisma.examBlueprint.delete({ where: { id } });
    return { ok: true };
  });

  // ── Generation ──
  app.get('/exam-builder/availability', { preHandler: manage }, async (req) => {
    const { types } = parse(z.object({ types: z.string().max(200).optional() }), req.query);
    return svc.availabilityMatrix(types?.split(',').filter(Boolean));
  });
  app.post('/exam-builder/generate', { preHandler: manage, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => svc.runGeneration(parse(generationConfigSchema, req.body)));

  /** Approved questions for manual selection (staff only; no answer keys). */
  app.get('/exam-builder/questions', { preHandler: manage }, async (req) => {
    const q = parse(
      z.object({
        q: z.string().max(200).optional(),
        categoryId: z.string().max(64).optional(),
        difficulty: z.coerce.number().int().min(1).max(4).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      }),
      req.query,
    );
    const where: Prisma.QuestionWhereInput = {
      status: { in: ['APPROVED', 'PUBLISHED'] },
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.difficulty ? { difficulty: q.difficulty } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { content: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.question.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { id: true, code: true, title: true, type: true, difficulty: true, isCalculation: true, isScenario: true, conceptKey: true, category: { select: { id: true, code: true, name: true } } },
      }),
      prisma.question.count({ where }),
    ]);
    return paged(items, total, q.page, q.pageSize);
  });

  // ── Exams ──
  app.get('/exams', { preHandler: view }, async (req) => {
    const q = parse(z.object({ status: z.enum(EXAM_STATUSES).optional(), q: z.string().max(200).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(20) }), req.query);
    const where: Prisma.ExaminationWhereInput = {
      ...(q.status ? { status: q.status } : { status: { not: 'ARCHIVED' } }),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.examination.findMany({ where, include: svc.examInclude, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.examination.count({ where }),
    ]);
    const passAgg = await prisma.examinationResult.groupBy({ by: ['examinationId'], where: { examinationId: { in: items.map((i) => i.id) } }, _avg: { scorePercent: true }, _count: { _all: true } });
    const passed = await prisma.examinationResult.groupBy({ by: ['examinationId'], where: { examinationId: { in: items.map((i) => i.id) }, passed: true }, _count: { _all: true } });
    const stat = new Map(passAgg.map((p) => [p.examinationId, p]));
    const passMap = new Map(passed.map((p) => [p.examinationId, p._count._all]));
    return paged(
      items.map((e) => {
        const s = stat.get(e.id);
        return { ...svc.serializeExam(e), avgScore: s?._avg.scorePercent ? Number(s._avg.scorePercent) : null, passRate: s?._count._all ? ((passMap.get(e.id) ?? 0) / s._count._all) * 100 : null };
      }),
      total,
      q.page,
      q.pageSize,
    );
  });

  app.get('/exams/:id', { preHandler: view }, async (req) => {
    const { id } = parse(idParam, req.params);
    const e = await prisma.examination.findUnique({
      where: { id },
      include: {
        ...svc.examInclude,
        questions: {
          orderBy: { sortOrder: 'asc' },
          include: { question: { select: { id: true, code: true, title: true, type: true, difficulty: true, status: true, isCalculation: true, isScenario: true, conceptKey: true, category: { select: { id: true, code: true, name: true } } } } },
        },
        assignments: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, fullName: true, username: true, department: true } }, group: { select: { id: true, name: true, _count: { select: { members: true } } } }, assignedBy: { select: { fullName: true } } },
        },
      },
    });
    if (!e) throw notFound('Không tìm thấy đề thi');
    return { ...svc.serializeExam(e), questions: e.questions.map((q) => ({ ...q, points: Number(q.points) })) };
  });

  const createBody = z.intersection(examInputSchema, z.object({ questionIds: z.array(z.string()).max(300).optional(), generationConfig: generationConfigSchema.nullable().optional() }));
  app.post('/exams', { preHandler: manage }, async (req, reply) => {
    const e = await svc.createExam(req, parse(createBody, req.body));
    reply.code(201);
    return svc.serializeExam(e);
  });

  app.put('/exams/:id', { preHandler: manage }, async (req) => {
    const { id } = parse(idParam, req.params);
    return svc.serializeExam(await svc.updateExam(req, id, parse(examInputSchema, req.body)));
  });

  app.put('/exams/:id/questions', { preHandler: manage }, async (req) => {
    const { id } = parse(idParam, req.params);
    const { questionIds } = parse(examQuestionsSetSchema, req.body);
    const points = parse(z.object({ points: z.record(z.string(), z.number().min(0.1).max(100)).optional() }), req.body).points;
    await svc.setExamQuestions(req, id, questionIds, points);
    return { ok: true };
  });

  app.post('/exams/:id/status', { preHandler: manage }, async (req) => {
    const { id } = parse(idParam, req.params);
    const { status } = parse(z.object({ status: z.enum(['PUBLISHED', 'CLOSED', 'ARCHIVED', 'DRAFT']) }), req.body);
    return svc.serializeExam(await svc.changeExamStatus(req, id, status));
  });

  app.post('/exams/:id/duplicate', { preHandler: manage }, async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const r = await svc.duplicateExam(req, id);
    reply.code(201);
    return { exam: svc.serializeExam(r.exam), skipped: r.skipped };
  });

  app.delete('/exams/:id', { preHandler: manage }, async (req) => {
    const { id } = parse(idParam, req.params);
    await svc.deleteExam(req, id);
    return { ok: true };
  });

  // ── Assignments ──
  app.post('/exams/:id/assignments', { preHandler: requireAuth('exams.assign') }, async (req) => {
    const { id } = parse(idParam, req.params);
    return svc.assign(req, id, parse(assignmentSchema, req.body));
  });
  app.delete('/exams/:id/assignments/:assignmentId', { preHandler: requireAuth('exams.assign') }, async (req) => {
    const { id, assignmentId } = parse(z.object({ id: z.string(), assignmentId: z.string() }), req.params);
    const r = await prisma.examinationAssignment.deleteMany({ where: { id: assignmentId, examinationId: id } });
    if (!r.count) throw notFound();
    await audit(req, 'exam.unassign', 'exam', id, { assignmentId });
    return { ok: true };
  });
}
