import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import { config } from '../src/config';
import { prisma } from '../src/db';
import { Client, getApp, loginAs } from './helpers';

describe('Phase 7 – security hardening', () => {
  let admin: Client, cand: Client, author: Client;
  beforeAll(async () => {
    admin = await loginAs('admin');
    cand = await loginAs('ts.nguyenvan');
    author = await loginAs('bientap');
  });

  it('login endpoint is rate limited', async () => {
    const prev = config.loginRateLimit;
    config.loginRateLimit = 3;
    const app = await buildApp({ logger: false });
    await app.ready();
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'x', password: 'y' } })).statusCode);
    config.loginRateLimit = prev;
    await app.close();
    expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
    expect(codes[4]).toBe(429);
  });

  it('sends security headers (CSP, frame-ancestors, nosniff, referrer policy)', async () => {
    const res = await (await getApp()).inject({ url: '/api/health' });
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['content-security-policy']).toContain("object-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBeTruthy();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('does not expose API documentation', async () => {
    for (const url of ['/docs', '/api/docs', '/swagger', '/api/swagger.json', '/documentation']) {
      const r = await (await getApp()).inject({ url });
      // Either 404 or the SPA shell – never an API description.
      expect(r.body.toLowerCase()).not.toMatch(/swagger|openapi/);
      if (r.statusCode === 200) expect(r.headers['content-type']).toContain('text/html');
    }
  });

  it('SQL injection payloads in search/filter are handled safely', async () => {
    const payloads = ["' OR 1=1 --", '"; DROP TABLE questions; --', "%' UNION SELECT password_hash FROM users --"];
    for (const p of payloads) {
      const r = await admin.get(`/api/questions?q=${encodeURIComponent(p)}`);
      expect(r.statusCode).toBe(200);
      expect(r.json().total).toBe(0);
      expect(r.body).not.toContain('argon2');
    }
    expect(await prisma.question.count()).toBeGreaterThan(0);
    const bad = await admin.get(`/api/questions?difficulty=${encodeURIComponent('1 OR 1=1')}`);
    expect(bad.statusCode).toBe(422);
  });

  it('stores script content verbatim as JSON data (rendered without HTML on the client)', async () => {
    const cats = (await admin.get('/api/categories')).json();
    const xss = '<img src=x onerror=alert(1)> <script>alert(2)</script> Nội dung đủ dài để vượt qua kiểm tra độ dài tối thiểu.';
    const r = await author.post('/api/questions', { title: '<script>alert(1)</script>', content: xss, type: 'TRUE_FALSE', categoryId: cats[0].id, difficulty: 1, calcComplexity: 0, isCalculation: false, isScenario: false, options: [{ label: 'Đúng', isCorrect: true }, { label: 'Sai', isCorrect: false }], tags: [], references: [] });
    expect(r.statusCode).toBe(201);
    expect(r.headers['content-type']).toContain('application/json');
    expect(r.json().content).toBe(xss);
  });

  it('never returns password hashes or session tokens', async () => {
    const users = await admin.get('/api/users?pageSize=100');
    expect(users.body).not.toMatch(/passwordHash|password_hash|\$argon2/);
    const me = await admin.get('/api/auth/me');
    expect(me.body).not.toMatch(/tokenHash|passwordHash/);
  });

  it('rejects oversized bodies and unknown content types', async () => {
    const big = 'x'.repeat(3 * 1024 * 1024);
    const r = await admin.post('/api/questions/check', { input: { content: big } });
    expect(r.statusCode).toBe(413);
    const ct = await (await getApp()).inject({ method: 'POST', url: '/api/auth/login', payload: 'a=b', headers: { 'content-type': 'text/xml' } });
    expect([400, 415]).toContain(ct.statusCode);
  });

  it('privilege escalation attempts are blocked', async () => {
    const meId = (await cand.get('/api/auth/me')).json().id;
    expect((await cand.patch(`/api/users/${meId}`, { roleCode: 'ADMIN' })).statusCode).toBe(403);
    const roles = (await admin.get('/api/roles')).json();
    const candRole = roles.roles.find((r: { code: string }) => r.code === 'CANDIDATE');
    expect((await cand.put(`/api/roles/${candRole.id}/permissions`, { permissions: ['users.manage'] })).statusCode).toBe(403);
    expect((await author.post('/api/questions/x/status', { status: 'APPROVED' })).statusCode).toBe(404);
    expect((await cand.put('/api/settings', { aiEnabled: false })).statusCode).toBe(403);
  });

  it('every non-public API route requires authentication', async () => {
    const app = await getApp();
    const routes = ['/api/users', '/api/questions', '/api/exams', '/api/results', '/api/analytics', '/api/dashboard', '/api/my/exams', '/api/settings', '/api/ai/status', '/api/blueprints', '/api/categories', '/api/audit-logs'];
    for (const url of routes) expect((await app.inject({ url })).statusCode, url).toBe(401);
  });

  it('error responses never leak stack traces', async () => {
    const r = await admin.get('/api/questions/%E0%A4%A');
    expect(r.body).not.toMatch(/at \w+ \(|node_modules|PrismaClient/);
  });
});

describe('Phase 7 – performance with a large question bank', () => {
  let admin: Client;
  beforeAll(async () => {
    admin = await loginAs('admin');
    const author = await prisma.user.findUniqueOrThrow({ where: { username: 'bientap' } });
    const cats = await prisma.questionCategory.findMany({ where: { parentId: null } });
    const N = 6000;
    const rows = Array.from({ length: N }, (_, i) => {
      const c = cats[i % cats.length]!;
      return {
        code: `PERF-${c.code}-${String(i).padStart(5, '0')}`,
        title: `Câu hỏi hiệu năng số ${i} – ${c.name}`,
        content: `Nội dung kiểm thử hiệu năng ${i}: chuỗi ${10 + (i % 15)} tấm, Voc ${40 + (i % 10)} V, hệ số nhiệt −0,${25 + (i % 9)} %/°C, nhiệt độ ${i % 20} °C.`,
        type: 'SINGLE_CHOICE' as const,
        categoryId: c.id,
        difficulty: 1 + (i % 4),
        status: i % 3 === 0 ? ('APPROVED' as const) : ('DRAFT' as const),
        authorId: author.id,
        tags: ['perf'],
      };
    });
    for (let i = 0; i < rows.length; i += 1000) await prisma.question.createMany({ data: rows.slice(i, i + 1000) });
  }, 120_000);
  afterAll(async () => {
    await prisma.question.deleteMany({ where: { code: { startsWith: 'PERF-' } } });
  });

  const timed = async (fn: () => Promise<unknown>) => { const t0 = performance.now(); await fn(); return performance.now() - t0; };

  it('list, filter and keyword search stay fast (< 600 ms)', async () => {
    expect(await timed(() => admin.get('/api/questions?pageSize=50'))).toBeLessThan(600);
    expect(await timed(() => admin.get('/api/questions?difficulty=3&status=APPROVED&pageSize=50'))).toBeLessThan(600);
    const t = await timed(async () => {
      const r = await admin.get(`/api/questions?q=${encodeURIComponent('hiệu năng số 4321')}`);
      expect(r.json().total).toBeGreaterThanOrEqual(1);
    });
    expect(t).toBeLessThan(600);
  });

  it('duplicate detection over the large bank (< 1000 ms)', async () => {
    const cats = (await admin.get('/api/categories')).json();
    const t = await timed(async () => {
      const r = await admin.post('/api/questions/check', { input: { title: 'x', content: 'Nội dung kiểm thử hiệu năng 77: chuỗi 12 tấm, Voc 47 V, hệ số nhiệt −0,30 %/°C, nhiệt độ 17 °C.', type: 'SINGLE_CHOICE', categoryId: cats[0].id, difficulty: 2, options: [], tags: [], references: [] } });
      expect(r.json().similar[0].score).toBeGreaterThan(0.6);
    });
    expect(t).toBeLessThan(1000);
  });

  it('category tree with counts and availability matrix stay fast', async () => {
    expect(await timed(() => admin.get('/api/categories'))).toBeLessThan(500);
    expect(await timed(() => admin.get('/api/exam-builder/availability'))).toBeLessThan(500);
  });

  it('30-question generation from a 2000+ approved pool (< 1500 ms)', async () => {
    const bp = (await admin.get('/api/blueprints')).json().find((b: { isDefault: boolean }) => b.isDefault);
    const t = await timed(async () => {
      const r = await admin.post('/api/exam-builder/generate', { ...bp.config, minCalculation: 0, minScenario: 0, seed: 3 });
      expect(r.json().questionIds).toHaveLength(30);
    });
    expect(t).toBeLessThan(1500);
  });
});
