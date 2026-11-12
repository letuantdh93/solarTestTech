import type { FastifyInstance } from 'fastify';
import { loginSchema, changePasswordSchema } from '@solar/shared';
import { prisma } from '../../db';
import { parse } from '../../lib/validate';
import { AppError, badRequest, unauthorized } from '../../lib/errors';
import { createSession, destroySession, requireAccount, requireAuth } from '../../lib/auth';
import { dummyHash, hashPassword, verifyPassword } from '../../lib/password';
import { audit } from '../../lib/audit';
import { config } from '../../config';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export function meResponse(req: import('fastify').FastifyRequest) {
  const u = req.user!;
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.roleCode,
    permissions: [...u.permissions],
    mustChangePassword: u.mustChangePassword,
    isGuest: u.isGuest,
    csrfToken: u.csrfToken,
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/login',
    { config: { rateLimit: { max: config.loginRateLimit, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { username, password } = parse(loginSchema, req.body);
      const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
      const invalid = () => unauthorized('Tên đăng nhập hoặc mật khẩu không đúng');
      if (!user || user.isGuest) {
        await verifyPassword(await dummyHash(), password);
        throw invalid();
      }
      if (!user.isActive) throw new AppError(403, 'Tài khoản đã bị vô hiệu hóa. Liên hệ quản trị viên.', 'INACTIVE');
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new AppError(423, 'Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.', 'LOCKED');
      }
      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) {
        const failed = user.failedLogins + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLogins: failed >= MAX_FAILED ? 0 : failed,
            lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
          },
        });
        if (failed >= MAX_FAILED) await audit(req, 'auth.locked', 'user', user.id);
        throw invalid();
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
      await createSession(req, reply, user.id);
      await prisma.auditLog.create({
        data: { actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, ip: req.ip },
      });
      return { ok: true };
    },
  );

  app.post('/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  app.get('/me', { preHandler: requireAuth() }, async (req) => meResponse(req));

  app.post(
    '/change-password',
    { preHandler: requireAccount(), config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const body = parse(changePasswordSchema, req.body);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
      if (!(await verifyPassword(user.passwordHash, body.currentPassword)))
        throw badRequest('Mật khẩu hiện tại không đúng');
      if (body.currentPassword === body.newPassword) throw badRequest('Mật khẩu mới phải khác mật khẩu hiện tại');
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false },
        }),
        // Revoke all other sessions
        prisma.session.deleteMany({ where: { userId: user.id, id: { not: req.user!.sessionId } } }),
      ]);
      await audit(req, 'auth.change_password', 'user', user.id);
      return { ok: true };
    },
  );
}
