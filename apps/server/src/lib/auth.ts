import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Permission, RoleCode } from '@solar/shared';
import { prisma } from '../db';
import { config } from '../config';
import { forbidden, unauthorized, AppError } from './errors';

export const SESSION_COOKIE = 'sid';
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  roleId: string;
  roleCode: RoleCode;
  permissions: Set<Permission>;
  mustChangePassword: boolean;
  sessionId: string;
  csrfToken: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

// Small cache of role -> permissions (invalidated when an admin edits a role).
const permCache = new Map<string, { perms: Set<Permission>; at: number }>();
export function invalidatePermissionCache() {
  permCache.clear();
}
async function rolePermissions(roleId: string): Promise<Set<Permission>> {
  const hit = permCache.get(roleId);
  if (hit && Date.now() - hit.at < 60_000) return hit.perms;
  const rows = await prisma.rolePermission.findMany({ where: { roleId }, include: { permission: true } });
  const perms = new Set(rows.map((r) => r.permission.code as Permission));
  permCache.set(roleId, { perms, at: Date.now() });
  return perms;
}

function cookieOpts(httpOnly: boolean) {
  return {
    path: '/',
    httpOnly,
    sameSite: 'strict' as const,
    secure: config.cookieSecure,
    maxAge: config.sessionTtlHours * 3600,
  };
}

export async function createSession(req: FastifyRequest, reply: FastifyReply, userId: string) {
  const token = randomToken();
  const csrfToken = randomToken();
  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      csrfToken,
      userId,
      expiresAt: new Date(Date.now() + config.sessionTtlHours * 3600_000),
      ip: req.ip,
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
    },
  });
  reply.setCookie(SESSION_COOKIE, token, cookieOpts(true));
  reply.setCookie(CSRF_COOKIE, csrfToken, cookieOpts(false));
  return csrfToken;
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply) {
  if (req.user) await prisma.session.deleteMany({ where: { id: req.user.sessionId } });
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { include: { role: true } } },
    });
    if (!session || session.expiresAt < new Date() || !session.user.isActive) return;

    // Sliding expiry, written at most once per 5 minutes.
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
      await prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + config.sessionTtlHours * 3600_000) },
      });
    }
    req.user = {
      id: session.user.id,
      username: session.user.username,
      fullName: session.user.fullName,
      roleId: session.user.roleId,
      roleCode: session.user.role.code as RoleCode,
      permissions: await rolePermissions(session.user.roleId),
      mustChangePassword: session.user.mustChangePassword,
      sessionId: session.id,
      csrfToken: session.csrfToken,
    };
  });

  // CSRF: authenticated state-changing requests must echo the session's token.
  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/api/') || SAFE_METHODS.has(req.method) || !req.user) return;
    const header = req.headers[CSRF_HEADER];
    const a = Buffer.from(String(header ?? ''));
    const b = Buffer.from(req.user.csrfToken);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new AppError(403, 'Phiên làm việc không hợp lệ (CSRF). Vui lòng tải lại trang.', 'CSRF');
    }
  });
});

/** Route guard: requires login and (optionally) any of the given permissions. */
export function requireAuth(...anyOf: Permission[]) {
  return async (req: FastifyRequest) => {
    if (!req.user) throw unauthorized();
    if (anyOf.length && !anyOf.some((p) => req.user!.permissions.has(p))) throw forbidden();
  };
}

export function hasPerm(req: FastifyRequest, p: Permission) {
  return !!req.user?.permissions.has(p);
}

export async function purgeExpiredSessions() {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
