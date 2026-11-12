import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db';
import { config } from '../../config';
import { requireAuth, hasPerm } from '../../lib/auth';
import { parse } from '../../lib/validate';
import { badRequest, forbidden, notFound } from '../../lib/errors';

/** Detect image type from magic bytes (never trust the client-provided mime type). SVG is rejected (script risk). */
export function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('ascii') === 'PNG') return { mime: 'image/png', ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };
  return null;
}

export async function mediaRoutes(app: FastifyInstance) {
  fs.mkdirSync(config.uploadDir, { recursive: true });

  app.post('/media', { preHandler: requireAuth('questions.create', 'questions.edit_all'), config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const file = await req.file();
    if (!file) throw badRequest('Chưa chọn tệp');
    const buf = await file.toBuffer();
    const kind = sniffImage(buf);
    if (!kind) throw badRequest('Định dạng tệp không được hỗ trợ. Chỉ chấp nhận PNG, JPG, WEBP, GIF.');
    const storedName = `${crypto.randomBytes(16).toString('hex')}.${kind.ext}`;
    fs.writeFileSync(path.join(config.uploadDir, storedName), buf, { mode: 0o640 });
    const caption = typeof (file.fields.caption as { value?: unknown } | undefined)?.value === 'string' ? String((file.fields.caption as { value: string }).value).slice(0, 300) : null;
    const m = await prisma.questionMedia.create({
      data: { storedName, originalName: file.filename.slice(0, 200), mimeType: kind.mime, size: buf.length, caption, uploadedById: req.user!.id },
    });
    reply.code(201);
    return { id: m.id, url: `/api/media/${m.id}`, mimeType: m.mimeType, size: m.size, originalName: m.originalName };
  });

  app.get('/media/:id', { preHandler: requireAuth() }, async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().min(1).max(64) }), req.params);
    const m = await prisma.questionMedia.findUnique({ where: { id } });
    if (!m) throw notFound();
    const staff = hasPerm(req, 'questions.view_all') || hasPerm(req, 'questions.review') || hasPerm(req, 'questions.edit_all');
    if (!staff && m.uploadedById !== req.user!.id) {
      // Candidates may only see media of questions delivered in their own attempts.
      const ok = m.questionId
        ? await prisma.attemptQuestion.count({ where: { questionId: m.questionId, attempt: { userId: req.user!.id } } })
        : 0;
      const ownAuthor = m.questionId ? await prisma.question.count({ where: { id: m.questionId, authorId: req.user!.id } }) : 0;
      if (!ok && !ownAuthor) throw forbidden();
    }
    const file = path.join(config.uploadDir, path.basename(m.storedName));
    if (!fs.existsSync(file)) throw notFound();
    reply
      .header('content-type', m.mimeType)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, max-age=3600')
      .header('content-disposition', 'inline');
    return reply.send(fs.createReadStream(file));
  });
}
