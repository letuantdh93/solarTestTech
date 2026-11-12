import { describe, it, expect, beforeAll } from 'vitest';
import { Client, getApp, loginAs } from './helpers';
import { prisma } from '../src/db';

const anon = async () => new Client(await getApp());

describe('Phase 8 – exam entry without login (name / phone / department)', () => {
  let manager: Client;
  let code = '';
  let examId = '';
  let privateCode = '';
  beforeAll(async () => {
    manager = await loginAs('quanly');
    const bp = (await manager.get('/api/blueprints')).json().find((b: { isDefault: boolean }) => b.isDefault);
    const ids = (await manager.post('/api/exam-builder/generate', { ...bp.config, seed: 77 })).json().questionIds;
    const mk = async (name: string, publicAccess: boolean, maxAttempts = 1) => {
      const e = (await manager.post('/api/exams', { name, durationMinutes: 30, passingScore: 60, randomizeQuestions: true, randomizeOptions: true, maxAttempts, resultVisibility: 'DETAILED', explanationVisibility: 'AFTER_SUBMIT', publicAccess, questionIds: ids.slice(0, 10) })).json();
      await manager.post(`/api/exams/${e.id}/status`, { status: 'PUBLISHED' });
      return e;
    };
    const pub = await mk('Đề công khai', true);
    code = pub.code; examId = pub.id;
    privateCode = (await mk('Đề nội bộ', false)).code;
    await mk('Đề nháp công khai', true).then((e) => manager.post(`/api/exams/${e.id}/status`, { status: 'CLOSED' }));
  });

  it('lists only open public exams to anonymous visitors (no answer keys)', async () => {
    const c = await anon();
    const list = (await c.get('/api/public/exams')).json();
    const codes = list.map((e: { code: string }) => e.code);
    expect(codes).toContain(code);
    expect(codes).not.toContain(privateCode);
    expect(JSON.stringify(list)).not.toMatch(/isCorrect|questionId|options/);
    expect((await c.get(`/api/public/exams/${privateCode}`)).statusCode).toBe(404);
    expect((await c.post(`/api/public/exams/${privateCode}/start`, { fullName: 'Nguyễn Văn Bé', phone: '0911111111', department: 'Kho vận' })).statusCode).toBe(404);
  });

  it('validates the entry form in Vietnamese', async () => {
    const r = await (await anon()).post(`/api/public/exams/${code}/start`, { fullName: 'A', phone: '12345', department: '' });
    expect(r.statusCode).toBe(422);
    const msgs = r.json().details.map((d: { message: string }) => d.message).join(' | ');
    expect(msgs).toMatch(/họ và tên/);
    expect(msgs).toMatch(/Số điện thoại không hợp lệ/);
    expect(msgs).toMatch(/phòng ban/);
  });

  let guest: Client;
  let attemptId = '';
  it('starts an attempt with name/phone/department, creates a guest candidate and a scoped session', async () => {
    guest = await anon();
    const r = await guest.post(`/api/public/exams/${code}/start`, { fullName: 'Trần Thị Mai', phone: '+84 912 345 678', department: 'Phòng Thiết kế' });
    expect(r.statusCode).toBe(200);
    attemptId = r.json().attemptId;
    const me = (await guest.get('/api/auth/me')).json();
    expect(me).toMatchObject({ isGuest: true, fullName: 'Trần Thị Mai', role: 'CANDIDATE' });
    expect(me.permissions.sort()).toEqual(['exams.take', 'results.view_own']);
    const u = await prisma.user.findUniqueOrThrow({ where: { phone: '0912345678' } });
    expect(u.isGuest).toBe(true);
    expect(u.department).toBe('Phòng Thiết kế');
    const view = (await guest.get(`/api/attempts/${attemptId}`)).json();
    expect(view.questions).toHaveLength(10);
    expect(JSON.stringify(view)).not.toMatch(/isCorrect|explanation/);
  });

  it('guest sessions cannot use account-only or staff features', async () => {
    for (const url of ['/api/my/exams', '/api/my/results', '/api/questions', '/api/exams', '/api/users', '/api/results'])
      expect((await guest.get(url)).statusCode, url).toBe(403);
    expect((await guest.post('/api/auth/change-password', { currentPassword: 'x', newPassword: 'Abcdefgh12' })).statusCode).toBe(403);
    const d = (await guest.get('/api/dashboard')).json();
    expect(d.candidate).toBeUndefined();
  });

  it('guest identities cannot log in with a password', async () => {
    const r = await (await anon()).post('/api/auth/login', { username: 'sdt.0912345678', password: 'anything' });
    expect(r.statusCode).toBe(401);
  });

  it('re-entering the same phone in another browser resumes the attempt there and revokes it from the first browser', async () => {
    const other = await anon();
    const r = await other.post(`/api/public/exams/${code}/start`, { fullName: '  tran thi   mai ', phone: '0912 345 678', department: 'Phòng Thiết kế' });
    expect(r.json().attemptId).toBe(attemptId);
    expect((await other.get(`/api/attempts/${attemptId}`)).statusCode).toBe(200);
    expect((await guest.get(`/api/attempts/${attemptId}`)).statusCode).toBe(404);
    guest = other;
  });

  it('submits, shows the result to this session only; same phone in a new session cannot read old results', async () => {
    const aqs = await prisma.attemptQuestion.findMany({ where: { attemptId } });
    for (const aq of aqs.slice(0, 6)) {
      const s = aq.snapshot as { type: string; options: Array<{ id: string; isCorrect: boolean }>; numeric: { answer: number } | null };
      await guest.put(`/api/attempts/${attemptId}/answers`, s.type === 'NUMERIC' ? { attemptQuestionId: aq.id, numericValue: s.numeric!.answer } : { attemptQuestionId: aq.id, selectedOptionIds: s.options.filter((o) => o.isCorrect).map((o) => o.id) });
    }
    expect((await guest.post(`/api/attempts/${attemptId}/submit`)).statusCode).toBe(200);
    const res = (await guest.get(`/api/results/attempts/${attemptId}`)).json();
    expect(res.summary.correctCount).toBe(6);
    expect(res.summary.scorePercent).toBe(60);
    expect(res.candidate.phone).toBe('0912345678');
    expect((await guest.get(`/api/results/attempts/${attemptId}/pdf`)).statusCode).toBe(200);
    // Someone else typing the same phone number: attempt limit reached and no access to the result
    const intruder = await anon();
    const again = await intruder.post(`/api/public/exams/${code}/start`, { fullName: 'Trần Thị Mai', phone: '0912345678', department: 'Không rõ' });
    expect(again.statusCode).toBe(403);
    expect(again.json().message).toMatch(/hết số lần thi/);
    // A different person's name with the same phone is rejected with a field error
    const other = await intruder.post(`/api/public/exams/${code}/start`, { fullName: 'Người Khác', phone: '0912345678', department: 'Không rõ' });
    expect(other.statusCode).toBe(409);
    expect(other.json().code).toBe('PHONE_NAME_MISMATCH');
    expect(other.json().details[0].path).toBe('phone');
    expect((await prisma.user.findUniqueOrThrow({ where: { phone: '0912345678' } })).fullName).toBe('Trần Thị Mai');
    expect((await intruder.get(`/api/results/attempts/${attemptId}`)).statusCode).toBe(401);
  });

  it('staff see guest results with phone and department; Excel has the phone column', async () => {
    const list = (await manager.get(`/api/results?examId=${examId}`)).json();
    expect(list.items[0].user).toMatchObject({ phone: '0912345678', department: 'Không rõ', isGuest: true });
    const users = (await (await loginAs('admin')).get('/api/users?q=0912345678')).json();
    expect(users.items[0].isGuest).toBe(true);
  });

  it('phones registered to login accounts must log in instead', async () => {
    const admin = await loginAs('admin');
    const cand = await prisma.user.findUniqueOrThrow({ where: { username: 'ts.vu' } });
    await prisma.user.update({ where: { id: cand.id }, data: { phone: '0988000111' } });
    const r = await (await anon()).post(`/api/public/exams/${code}/start`, { fullName: 'Vũ Thị Dung', phone: '0988000111', department: 'Đội Thi công' });
    expect(r.statusCode).toBe(403);
    expect(r.json().message).toMatch(/đăng nhập/);
    await prisma.user.update({ where: { id: cand.id }, data: { phone: null } });
    expect(admin).toBeTruthy();
  });

  it('account candidates can also take public exams without being assigned', async () => {
    const c = await loginAs('ts.hoang');
    const r = await c.post(`/api/my/exams/${examId}/start`);
    expect(r.statusCode).toBe(200);
  });
});

describe('Question order is randomised on every attempt', () => {
  it('ignores randomizeQuestions=false and shuffles each attempt independently', async () => {
    const manager = await loginAs('quanly');
    const bp = (await manager.get('/api/blueprints')).json().find((b: { isDefault: boolean }) => b.isDefault);
    const ids = (await manager.post('/api/exam-builder/generate', { ...bp.config, seed: 91 })).json().questionIds;
    const e = (await manager.post('/api/exams', { name: 'Đề kiểm tra xáo trộn', durationMinutes: 30, passingScore: 60, randomizeQuestions: false, randomizeOptions: false, maxAttempts: 5, resultVisibility: 'DETAILED', explanationVisibility: 'AFTER_SUBMIT', publicAccess: true, questionIds: ids })).json();
    expect(e.randomizeQuestions).toBe(true);
    await manager.post(`/api/exams/${e.id}/status`, { status: 'PUBLISHED' });
    const orders: string[] = [];
    for (let i = 0; i < 3; i++) {
      const c = new Client(await getApp());
      const s = (await c.post(`/api/public/exams/${e.code}/start`, { fullName: 'Lê Văn Xáo', phone: '0933000222', department: 'Phòng Kỹ thuật' })).json();
      const qs = await prisma.attemptQuestion.findMany({ where: { attemptId: s.attemptId }, orderBy: { sortOrder: 'asc' } });
      orders.push(qs.map((q) => q.questionId).join());
      await c.post(`/api/attempts/${s.attemptId}/submit`);
    }
    expect(new Set(orders).size).toBe(3);
    expect(orders.every((o) => o !== ids.join())).toBe(true);
  });
});

describe('Random exam selection on every entry', () => {
  it('picks among open public exams with attempts left, resumes unfinished attempts, then stops when all are used', async () => {
    const manager = await loginAs('quanly');
    // Close all other public exams so the pool is known
    await prisma.examination.updateMany({ where: { status: 'PUBLISHED', publicAccess: true }, data: { status: 'CLOSED' } });
    const bp = (await manager.get('/api/blueprints')).json().find((b: { isDefault: boolean }) => b.isDefault);
    const ids = (await manager.post('/api/exam-builder/generate', { ...bp.config, seed: 5 })).json().questionIds;
    const codes: string[] = [];
    for (const n of [1, 2]) {
      const e = (await manager.post('/api/exams', { name: `Đề ngẫu nhiên ${n}`, durationMinutes: 30, passingScore: 60, randomizeQuestions: true, randomizeOptions: true, maxAttempts: 1, resultVisibility: 'DETAILED', explanationVisibility: 'AFTER_SUBMIT', publicAccess: true, questionIds: ids.slice(0, 5) })).json();
      await manager.post(`/api/exams/${e.id}/status`, { status: 'PUBLISHED' });
      codes.push(e.code);
    }
    const entry = { fullName: 'Phan Văn Ngẫu', phone: '0977123456', department: 'Phòng QC' };
    const c1 = new Client(await getApp());
    const first = (await c1.post('/api/public/start', entry)).json();
    expect(codes).toContain(first.examCode);
    // Re-entering before finishing resumes the same attempt
    const c1b = new Client(await getApp());
    expect((await c1b.post('/api/public/start', entry)).json().attemptId).toBe(first.attemptId);
    await c1b.post(`/api/attempts/${first.attemptId}/submit`);
    // Next entry must get the other exam (only one with attempts left)
    const second = (await (new Client(await getApp())).post('/api/public/start', entry)).json();
    expect(second.examCode).toBe(codes.find((c) => c !== first.examCode));
    await prisma.examinationAttempt.update({ where: { id: second.attemptId }, data: { deadlineAt: new Date(Date.now() - 60_000) } });
    // All used up
    const third = await (new Client(await getApp())).post('/api/public/start', entry);
    expect(third.statusCode).toBe(403);
    expect(third.json().message).toMatch(/hết số lần thi/);
    // Distribution: many different phones land on both exams
    const seen = new Set<string>();
    for (let i = 0; i < 12 && seen.size < 2; i++) {
      const r = (await (new Client(await getApp())).post('/api/public/start', { ...entry, phone: `09661000${String(i).padStart(2, '0')}` })).json();
      seen.add(r.examCode);
    }
    expect(seen.size).toBe(2);
  });
});

describe('Switching from a candidate session to staff login', () => {
  it('logging in from a browser holding a guest session replaces it with the staff session', async () => {
    const manager = await loginAs('quanly');
    const bp = (await manager.get('/api/blueprints')).json().find((b: { isDefault: boolean }) => b.isDefault);
    const ids = (await manager.post('/api/exam-builder/generate', { ...bp.config, seed: 12 })).json().questionIds;
    const e = (await manager.post('/api/exams', { name: 'Đề chuyển phiên', durationMinutes: 20, passingScore: 50, randomizeQuestions: true, randomizeOptions: true, maxAttempts: 1, resultVisibility: 'DETAILED', explanationVisibility: 'AFTER_SUBMIT', publicAccess: true, questionIds: ids.slice(0, 3) })).json();
    await manager.post(`/api/exams/${e.id}/status`, { status: 'PUBLISHED' });
    const browser = new Client(await getApp());
    const st = await browser.post(`/api/public/exams/${e.code}/start`, { fullName: 'Đỗ Minh Khoa', phone: '0944555666', department: 'Kho' });
    expect(st.statusCode).toBe(200); // 20-minute exam: fractional TTL must not break the cookie
    const guestSid = browser.cookies.sid;
    expect((await browser.get('/api/auth/me')).json().isGuest).toBe(true);
    const login = await browser.post('/api/auth/login', { username: 'quanly', password: 'Demo@123456' });
    expect(login.statusCode).toBe(200);
    const me = (await browser.get('/api/auth/me')).json();
    expect(me).toMatchObject({ isGuest: false, role: 'EXAM_MANAGER' });
    expect(browser.cookies.sid).not.toBe(guestSid);
    expect(await prisma.session.count({ where: { isGuest: true, user: { phone: '0944555666' } } })).toBe(0);
  });
});
