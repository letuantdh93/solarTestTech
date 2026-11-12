/**
 * Public (no-login) exam entry: candidates enter full name, phone and department.
 * The phone number identifies the candidate (attempt limits and history are per phone).
 */
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { guestEntrySchema, normalizePhone, stripDiacritics, USABLE_QUESTION_STATUSES } from '@solar/shared';

/** Name comparison tolerant to case, extra spaces and missing Vietnamese diacritics. */
const normName = (s: string) => stripDiacritics(s.normalize('NFC')).toLowerCase().replace(/\s+/g, ' ').trim();
import { prisma } from '../../db';
import { parse } from '../../lib/validate';
import { createSession } from '../../lib/auth';
import { config } from '../../config';
import { hashPassword } from '../../lib/password';
import { audit } from '../../lib/audit';
import { AppError, forbidden, notFound } from '../../lib/errors';
import { GRACE_MS, startAttempt, submitAttempt } from '../attempts/attempts.service';

const openWhere = (): Prisma.ExaminationWhereInput => {
  const now = new Date();
  return {
    status: 'PUBLISHED',
    publicAccess: true,
    AND: [{ OR: [{ startAt: null }, { startAt: { lte: now } }] }, { OR: [{ endAt: null }, { endAt: { gt: now } }] }],
    questions: { some: {} },
  };
};
const publicSelect = { id: true, code: true, name: true, description: true, targetAudience: true, durationMinutes: true, passingScore: true, maxAttempts: true, endAt: true, _count: { select: { questions: true } } } satisfies Prisma.ExaminationSelect;
const shape = (e: Prisma.ExaminationGetPayload<{ select: typeof publicSelect }>) => ({ ...e, passingScore: Number(e.passingScore), questionCount: e._count.questions, _count: undefined });
const codeParam = z.object({ code: z.string().min(1).max(40).regex(/^[A-Za-z0-9-]+$/) });

export async function publicRoutes(app: FastifyInstance) {
  app.get('/public/exams', async () => {
    const rows = await prisma.examination.findMany({ where: openWhere(), select: publicSelect, orderBy: [{ endAt: 'asc' }, { publishedAt: 'desc' }] });
    return rows.map(shape);
  });

  app.get('/public/exams/:code', async (req) => {
    const { code } = parse(codeParam, req.params);
    const e = await prisma.examination.findFirst({ where: { code, ...openWhere() }, select: publicSelect });
    if (!e) throw notFound('Kỳ thi không tồn tại hoặc hiện không mở');
    return shape(e);
  });

  /** Enter with name/phone/department; the system picks an exam at random among open public exams. */
  app.post('/public/start', { config: { rateLimit: { max: config.publicEntryRateLimit, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parse(guestEntrySchema, req.body);
    const phone = normalizePhone(body.phone)!;
    const open = await prisma.examination.findMany({ where: openWhere(), select: { id: true, maxAttempts: true } });
    if (!open.length) throw notFound('Hiện chưa có kỳ thi nào đang mở');
    const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    let pool = open;
    if (existing) {
      // Resume an unfinished attempt first; otherwise only exams with attempts left for this phone.
      // Close attempts whose time already ran out, so they count as used.
      const expired = await prisma.examinationAttempt.findMany({ where: { userId: existing.id, status: 'IN_PROGRESS', deadlineAt: { lt: new Date(Date.now() - GRACE_MS) } }, select: { id: true } });
      for (const a of expired) await submitAttempt(null, a.id, true);
      const inProgress = await prisma.examinationAttempt.findFirst({ where: { userId: existing.id, status: 'IN_PROGRESS', examinationId: { in: open.map((e) => e.id) } }, select: { examinationId: true } });
      if (inProgress) pool = open.filter((e) => e.id === inProgress.examinationId);
      else {
        const used = await prisma.examinationAttempt.groupBy({ by: ['examinationId'], where: { userId: existing.id, examinationId: { in: open.map((e) => e.id) } }, _count: { _all: true } });
        const count = new Map(used.map((u) => [u.examinationId, u._count._all]));
        pool = open.filter((e) => (count.get(e.id) ?? 0) < e.maxAttempts);
      }
    }
    if (!pool.length) throw forbidden('Bạn đã sử dụng hết số lần thi của tất cả các đề đang mở');
    const picked = pool[crypto.randomInt(pool.length)]!;
    return enter(req, reply, picked.id, body, phone);
  });

  /** Direct link to a specific exam. */
  app.post('/public/exams/:code/start', { config: { rateLimit: { max: config.publicEntryRateLimit, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { code } = parse(codeParam, req.params);
    const body = parse(guestEntrySchema, req.body);
    const exam = await prisma.examination.findFirst({ where: { code, ...openWhere() }, select: { id: true } });
    if (!exam) throw notFound('Kỳ thi không tồn tại hoặc hiện không mở');
    return enter(req, reply, exam.id, body, normalizePhone(body.phone)!);
  });
}

async function enter(req: FastifyRequest, reply: FastifyReply, examId: string, body: z.infer<typeof guestEntrySchema>, phone: string) {
    const exam = await prisma.examination.findFirst({ where: { id: examId, ...openWhere() }, include: { questions: { select: { question: { select: { status: true } } } } } });
    if (!exam) throw notFound('Kỳ thi không tồn tại hoặc hiện không mở');
    if (exam.questions.some((q) => !USABLE_QUESTION_STATUSES.includes(q.question.status)))
      throw new AppError(409, 'Đề thi có câu hỏi không còn hiệu lực. Vui lòng liên hệ người quản lý kỳ thi.', 'CONFLICT');

    // Find or create the candidate identified by phone.
    let user = await prisma.user.findUnique({ where: { phone } });
    if (user && !user.isGuest) throw forbidden('Số điện thoại này thuộc một tài khoản đăng nhập. Vui lòng đăng nhập để làm bài.');
    if (user && !user.isActive) throw forbidden('Thí sinh với số điện thoại này đã bị khóa. Liên hệ quản trị viên.');
    if (!user) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code: 'CANDIDATE' } });
      user = await prisma.user.create({
        data: {
          username: `sdt.${phone}`,
          phone,
          isGuest: true,
          fullName: body.fullName,
          department: body.department,
          roleId: role.id,
          // Random unusable password: guest identities cannot log in with a password.
          passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
        },
      });
    } else {
      // Phone identifies the candidate: a different name means a typo or someone else's number.
      if (normName(user.fullName) !== normName(body.fullName)) {
        const msg = 'Số điện thoại này đã được đăng ký với một họ tên khác. Vui lòng kiểm tra lại họ tên hoặc số điện thoại. Nếu thông tin cũ bị nhập sai, hãy liên hệ người quản lý kỳ thi.';
        throw new AppError(409, msg, 'PHONE_NAME_MISMATCH', [{ path: 'phone', message: msg }]);
      }
      // Department may legitimately change (transfer) – keep the latest.
      if (user.department !== body.department) user = await prisma.user.update({ where: { id: user.id }, data: { department: body.department } });
    }

    // Guest session lives just long enough for the exam plus result review.
    const session = await createSession(req, reply, user.id, { isGuest: true, ttlHours: exam.durationMinutes / 60 + 4 });
    req.user = {
      id: user.id, username: user.username, fullName: user.fullName, roleId: user.roleId, roleCode: 'CANDIDATE',
      permissions: new Set(['exams.take', 'results.view_own']), mustChangePassword: false, isGuest: true,
      sessionId: session.id, csrfToken: session.csrfToken,
    };
    let attempt;
    try {
      attempt = await startAttempt(req, exam.id);
    } catch (e) {
      // Entry refused (attempt limit, schedule…): do not leave a guest session behind.
      await prisma.session.deleteMany({ where: { id: session.id } });
      reply.clearCookie('sid', { path: '/' }).clearCookie('csrf_token', { path: '/' });
      throw e;
    }
    await audit(req, 'attempt.guest_entry', 'attempt', attempt.id, { examId: exam.id, phone: `${phone.slice(0, 3)}****${phone.slice(-3)}` });
    return { attemptId: attempt.id, examCode: exam.code, examName: exam.name };
}
