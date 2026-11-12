import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { saveAnswerSchema } from '@solar/shared';
import { parse } from '../../lib/validate';
import { requireAccount, requireAuth } from '../../lib/auth';
import { notFound } from '../../lib/errors';
import { prisma } from '../../db';
import * as svc from './attempts.service';

const idParam = z.object({ id: z.string().min(1).max(64) });

export async function attemptsRoutes(app: FastifyInstance) {
  const take = requireAuth('exams.take');

  app.get('/my/exams', { preHandler: [take, requireAccount()] }, async (req) => svc.myExams(req.user!.id));

  app.post('/my/exams/:id/start', { preHandler: take, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { id } = parse(idParam, req.params);
    const a = await svc.startAttempt(req, id);
    return { attemptId: a.id };
  });

  app.get('/attempts/:id', { preHandler: take }, async (req, reply) => {
    const { id } = parse(idParam, req.params);
    reply.header('cache-control', 'no-store');
    return svc.getAttemptForCandidate(req, id);
  });

  // Autosave: frequent, so a generous dedicated limit.
  app.put('/attempts/:id/answers', { preHandler: take, config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (req) => {
    const { id } = parse(idParam, req.params);
    return svc.saveAnswer(req, id, parse(saveAnswerSchema, req.body));
  });

  app.post('/attempts/:id/submit', { preHandler: take }, async (req) => {
    const { id } = parse(idParam, req.params);
    const a = await prisma.examinationAttempt.findUnique({ where: { id }, select: { userId: true, accessSessionId: true } });
    if (!a || !svc.canAccessAttempt(req, a)) throw notFound('Không tìm thấy lượt thi');
    return svc.submitAttempt(req, id, false);
  });

  /** Lightweight heartbeat for the countdown (server time is authoritative). */
  app.get('/attempts/:id/time', { preHandler: take }, async (req) => {
    const { id } = parse(idParam, req.params);
    const a = await prisma.examinationAttempt.findUnique({ where: { id }, select: { userId: true, accessSessionId: true, deadlineAt: true, status: true } });
    if (!a || !svc.canAccessAttempt(req, a)) throw notFound('Không tìm thấy lượt thi');
    return { serverNow: new Date(), deadlineAt: a.deadlineAt, status: a.status };
  });
}
