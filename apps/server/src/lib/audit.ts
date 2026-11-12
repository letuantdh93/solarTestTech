import type { FastifyRequest } from 'fastify';
import { prisma, type Tx } from '../db';

export async function audit(
  req: FastifyRequest | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
  tx?: Tx,
) {
  const db = tx ?? prisma;
  await db.auditLog.create({
    data: {
      actorId: req?.user?.id ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      details: (details ?? undefined) as object | undefined,
      ip: req?.ip ?? null,
    },
  });
}
