import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { settingsSchema } from '@solar/shared';
import { requireAuth } from '../../lib/auth';
import { parse } from '../../lib/validate';
import { audit } from '../../lib/audit';
import { prisma } from '../../db';
import { paged } from '../../lib/http';
import { config } from '../../config';
import { getSettings, updateSettings } from './settings.service';

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/settings', { preHandler: requireAuth() }, async () => ({
    ...(await getSettings()),
    aiConfigured: !!config.anthropicApiKey,
  }));
  app.put('/settings', { preHandler: requireAuth('settings.manage') }, async (req) => {
    const body = parse(settingsSchema, req.body);
    const s = await updateSettings(body);
    await audit(req, 'settings.update', 'settings', null, body);
    return s;
  });

  const auditQuery = z.object({
    entityType: z.string().max(50).optional(),
    action: z.string().max(80).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  });
  app.get('/audit-logs', { preHandler: requireAuth('audit.view') }, async (req) => {
    const q = parse(auditQuery, req.query);
    const where = {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { fullName: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return paged(items, total, q.page, q.pageSize);
  });
}
