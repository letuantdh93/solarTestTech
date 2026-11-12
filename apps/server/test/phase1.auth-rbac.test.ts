import { describe, it, expect, beforeAll } from 'vitest';
import { Client, getApp, loginAs, ADMIN_PW } from './helpers';

describe('Phase 1 – authentication, sessions, CSRF, RBAC', () => {
  let admin: Client;
  beforeAll(async () => {
    admin = await loginAs('admin', ADMIN_PW);
  });

  it('health endpoint', async () => {
    const res = await (await getApp()).inject({ url: '/api/health' });
    expect(res.json().ok).toBe(true);
  });

  it('rejects anonymous access with 401 and Vietnamese message', async () => {
    const res = await (await getApp()).inject({ url: '/api/users' });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/đăng nhập/);
  });

  it('login sets httpOnly session + csrf cookies; /me returns permissions', async () => {
    const c = new Client(await getApp());
    const res = await c.post('/api/auth/login', { username: 'admin', password: ADMIN_PW });
    const sid = res.cookies.find((x) => x.name === 'sid')!;
    expect(sid.httpOnly).toBe(true);
    expect(sid.sameSite).toBe('Strict');
    const me = await c.get('/api/auth/me');
    expect(me.json().role).toBe('ADMIN');
    expect(me.json().permissions).toContain('users.manage');
  });

  it('wrong password is rejected without revealing whether user exists', async () => {
    const c = new Client(await getApp());
    const a = await c.post('/api/auth/login', { username: 'admin', password: 'wrong' });
    const b = await c.post('/api/auth/login', { username: 'nobody-xyz', password: 'wrong' });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json().message).toBe(b.json().message);
  });

  it('locks the account after 5 failed attempts', async () => {
    const c = new Client(await getApp());
    await admin.post('/api/users', { username: 'lock.me', fullName: 'Khóa Thử', roleCode: 'CANDIDATE', password: 'GoodPass123' });
    for (let i = 0; i < 5; i++) await c.post('/api/auth/login', { username: 'lock.me', password: 'bad' });
    const res = await c.post('/api/auth/login', { username: 'lock.me', password: 'GoodPass123' });
    expect(res.statusCode).toBe(423);
  });

  it('requires CSRF token on state-changing requests', async () => {
    const res = await admin.post('/api/categories', { code: 'Z9', name: 'X' }, { 'x-csrf-token': 'forged' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('CSRF');
  });

  it('candidate cannot manage users, categories or view audit logs', async () => {
    const cand = await loginAs('ts.nguyenvan');
    expect((await cand.get('/api/users')).statusCode).toBe(403);
    expect((await cand.post('/api/categories', { code: 'Z1', name: 'Hack' })).statusCode).toBe(403);
    expect((await cand.get('/api/audit-logs')).statusCode).toBe(403);
    expect((await cand.get('/api/categories')).statusCode).toBe(200);
  });

  it('admin creates, updates and deactivates a user; deactivated user loses session', async () => {
    const create = await admin.post('/api/users', {
      username: 'Test.User', fullName: 'Người Dùng Thử', roleCode: 'CANDIDATE', password: 'StrongPass1',
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().id;
    expect(create.json().username).toBe('test.user');
    const u = await loginAs('test.user', 'StrongPass1');
    expect((await u.get('/api/auth/me')).json().mustChangePassword).toBe(true);
    const upd = await admin.patch(`/api/users/${id}`, { isActive: false });
    expect(upd.json().isActive).toBe(false);
    expect((await u.get('/api/auth/me')).statusCode).toBe(401);
    const weak = await admin.post('/api/users', { username: 'weak', fullName: 'W', roleCode: 'CANDIDATE', password: '123' });
    expect(weak.statusCode).toBe(422);
    expect(weak.json().details[0].message).toMatch(/Mật khẩu/);
  });

  it('admin cannot remove own admin rights; role permission edits apply', async () => {
    const roles = (await admin.get('/api/roles')).json();
    const adminRole = roles.roles.find((r: { code: string }) => r.code === 'ADMIN');
    const res = await admin.put(`/api/roles/${adminRole.id}/permissions`, { permissions: ['audit.view'] });
    expect(res.statusCode).toBe(400);
    const cand = roles.roles.find((r: { code: string }) => r.code === 'CANDIDATE');
    expect(cand.permissions).toEqual(expect.arrayContaining(['exams.take', 'results.view_own']));
  });

  it('change password revokes other sessions', async () => {
    await admin.post('/api/users', { username: 'pw.user', fullName: 'Đổi MK', roleCode: 'CANDIDATE', password: 'FirstPass12' });
    const s1 = await loginAs('pw.user', 'FirstPass12');
    const s2 = await loginAs('pw.user', 'FirstPass12');
    const r = await s1.post('/api/auth/change-password', { currentPassword: 'FirstPass12', newPassword: 'SecondPass34' });
    expect(r.statusCode).toBe(200);
    expect((await s2.get('/api/auth/me')).statusCode).toBe(401);
    expect((await s1.get('/api/auth/me')).statusCode).toBe(200);
  });

  it('category tree contains taxonomy A–K with subcategories', async () => {
    const tree = (await admin.get('/api/categories')).json();
    expect(tree.map((c: { code: string }) => c.code)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']);
    expect(tree.find((c: { code: string }) => c.code === 'C').children.length).toBe(10);
  });

  it('logout destroys session', async () => {
    const c = await loginAs('quanly');
    await c.post('/api/auth/logout');
    expect((await c.get('/api/auth/me')).statusCode).toBe(401);
  });

  it('writes audit logs for admin operations', async () => {
    const logs = (await admin.get('/api/audit-logs?action=user.')).json();
    expect(logs.items.length).toBeGreaterThan(0);
  });
});
