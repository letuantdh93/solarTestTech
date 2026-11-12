import fs from 'node:fs';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { Prisma } from '@prisma/client';
import { config } from './config';
import { authPlugin } from './lib/auth';
import { AppError } from './lib/errors';
import { authRoutes } from './modules/auth/auth.routes';
import { usersRoutes } from './modules/users/users.routes';
import { categoriesRoutes } from './modules/categories/categories.routes';
import { settingsRoutes } from './modules/settings/settings.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { questionsRoutes } from './modules/questions/questions.routes';
import { mediaRoutes } from './modules/questions/media.routes';
import { examsRoutes } from './modules/exams/exams.routes';
import { attemptsRoutes } from './modules/attempts/attempts.routes';
import { resultsRoutes } from './modules/results/results.routes';
import { aiRoutes } from './modules/ai/ai.routes';

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? !config.isTest,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.cookieSecure ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.cookieSecure,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: config.isTest ? 100000 : 600,
    timeWindow: '1 minute',
    allowList: (req) => !req.url.startsWith('/api/'),
    errorResponseBuilder: () => ({
      statusCode: 429,
      code: 'RATE_LIMIT',
      error: 'Too Many Requests',
      message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
    }),
  });
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1, fields: 10 } });
  await app.register(authPlugin);

  app.setErrorHandler((err: FastifyError | AppError | Error, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ code: err.code, message: err.message, details: err.details });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') return reply.code(404).send({ code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' });
      if (err.code === 'P2002')
        return reply.code(409).send({ code: 'CONFLICT', message: 'Dữ liệu bị trùng lặp với bản ghi đã có' });
      if (err.code === 'P2003')
        return reply.code(409).send({ code: 'CONFLICT', message: 'Dữ liệu đang được tham chiếu, không thể thực hiện' });
    }
    const fe = err as FastifyError;
    if (fe.statusCode === 429) return reply.code(429).send(err);
    if (fe.code === 'FST_REQ_FILE_TOO_LARGE')
      return reply.code(413).send({ code: 'FILE_TOO_LARGE', message: 'Tệp vượt quá dung lượng cho phép (5 MB)' });
    if (fe.validation || fe.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || fe.code === 'FST_ERR_CTP_EMPTY_JSON_BODY')
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'Yêu cầu không hợp lệ' });
    if (fe.statusCode && fe.statusCode < 500)
      return reply.code(fe.statusCode).send({ code: fe.code ?? 'BAD_REQUEST', message: 'Yêu cầu không hợp lệ' });
    req.log.error(err);
    return reply.code(500).send({ code: 'INTERNAL', message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại.' });
  });

  app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }));

  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(usersRoutes);
      await api.register(categoriesRoutes);
      await api.register(settingsRoutes);
      await api.register(dashboardRoutes);
      await api.register(questionsRoutes);
      await api.register(mediaRoutes);
      await api.register(examsRoutes);
      await api.register(attemptsRoutes);
      await api.register(resultsRoutes);
      await api.register(aiRoutes);
    },
    { prefix: '/api' },
  );

  // Serve built SPA (production). In dev, Vite serves the UI and proxies /api.
  if (fs.existsSync(config.webDist)) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      wildcard: true,
      // Hashed assets are immutable; index.html is never cached.
      setHeaders: (res, filePath) => {
        res.setHeader('cache-control', filePath.includes(`${'/'}assets${'/'}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Không tìm thấy API' });
      if (req.url.startsWith('/assets/') || /\.[a-z0-9]{2,5}$/i.test(req.url.split('?')[0]!))
        return reply.code(404).type('text/plain').send('Not found');
      return reply.type('text/html').header('cache-control', 'no-cache').sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ code: 'NOT_FOUND', message: 'Không tìm thấy' }));
  }

  return app;
}
