import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { aiGenerateSchema, aiDocumentSchema } from '@solar/shared';
import { parse } from '../../lib/validate';
import { requireAuth } from '../../lib/auth';
import * as svc from './ai.service';

const idParam = z.object({ id: z.string().min(1).max(64) });
const aiLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } };

export async function aiRoutes(app: FastifyInstance) {
  const ai = requireAuth('ai.use');
  app.get('/ai/status', { preHandler: ai }, async () => svc.aiStatus());
  app.post('/ai/generate', { preHandler: ai, config: aiLimit }, async (req) => svc.generateQuestions(req, parse(aiGenerateSchema, req.body)));
  app.post('/ai/document', { preHandler: ai, config: aiLimit }, async (req) => svc.documentToQuestions(req, parse(aiDocumentSchema, req.body)));
  app.post('/ai/questions/:id/review', { preHandler: ai, config: aiLimit }, async (req) => svc.reviewQuestion(req, parse(idParam, req.params).id));
  app.post('/ai/questions/:id/distractors', { preHandler: ai, config: aiLimit }, async (req) => {
    const { count } = parse(z.object({ count: z.number().int().min(1).max(5).default(3) }), req.body ?? {});
    return svc.suggestDistractors(req, parse(idParam, req.params).id, count);
  });
  app.post('/ai/questions/:id/explanation', { preHandler: ai, config: aiLimit }, async (req) => svc.suggestExplanation(req, parse(idParam, req.params).id));
  app.post('/ai/questions/:id/variants', { preHandler: ai, config: aiLimit }, async (req) => {
    const { count } = parse(z.object({ count: z.number().int().min(1).max(3).default(2) }), req.body ?? {});
    return svc.generateVariants(req, parse(idParam, req.params).id, count);
  });
  app.get('/ai/jobs', { preHandler: ai }, async (req) => {
    const q = parse(z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }), req.query);
    return svc.listJobs(req, q.page, q.pageSize);
  });
}
