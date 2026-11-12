import { chromium } from '@playwright/test';
const [out] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://127.0.0.1:2112';
const b = await chromium.launch();
const errs = [];
async function login(user, pw, viewport = { width: 1440, height: 900 }) {
  const ctx = await b.newContext({ viewport, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + '/dang-nhap');
  await p.fill('input[autocomplete=username]', user); await p.fill('input[autocomplete=current-password]', pw);
  await p.click('button[type=submit]'); await p.waitForURL((u) => !u.pathname.startsWith('/dang-nhap'));
  return p;
}
const csrf = async (p) => (await p.context().cookies()).find((c) => c.name === 'csrf_token').value;
// Manager assigns the latest published exam to all groups
const m = await login('quanly', 'Demo@123456');
const exams = await (await m.request.get(base + '/api/exams?status=PUBLISHED')).json();
const exam = exams.items[0];
const groups = await (await m.request.get(base + '/api/groups')).json();
await m.request.post(`${base}/api/exams/${exam.id}/assignments`, { data: { groupIds: groups.map((g) => g.id), userIds: [] }, headers: { 'x-csrf-token': await csrf(m) } });
// Candidate
const p = await login('ts.nguyenvan', 'Demo@123456');
await p.goto(base + '/thi'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/my-exams.png`, fullPage: true });
await p.getByRole('button', { name: /Bắt đầu làm bài|Tiếp tục làm bài/ }).first().click();
const startBtn = p.getByRole('dialog').getByRole('button', { name: 'Bắt đầu làm bài' });
if (await startBtn.count()) await startBtn.click();
await p.waitForURL(/\/thi\/lam-bai\//); await p.waitForLoadState('networkidle'); await p.waitForTimeout(800);
for (let i = 0; i < 12; i++) {
  const opt = p.locator('[role=radio],[role=checkbox]').first();
  if (await opt.count()) await opt.click(); else await p.getByLabel('Nhập kết quả').fill('100,5');
  if (i === 3) await p.getByRole('button', { name: 'Đánh dấu xem lại' }).first().click();
  await p.waitForTimeout(250);
  await p.getByRole('button', { name: 'Tiếp' }).click(); await p.waitForTimeout(250);
}
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/take-desktop.png` });
await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/take-mobile.png` });
await p.getByRole('button', { name: /Danh sách câu/ }).click(); await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/take-mobile-nav.png` });
await p.keyboard.press('Escape'); await p.mouse.click(10, 10); await p.waitForTimeout(400);
await p.setViewportSize({ width: 1440, height: 900 });
await p.getByRole('button', { name: 'Nộp bài' }).first().click(); await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/submit-confirm.png` });
await p.getByRole('dialog').getByRole('button', { name: 'Nộp bài' }).click();
await p.waitForURL(/\/ket-qua\/luot\//); await p.waitForLoadState('networkidle'); await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/result.png`, fullPage: true });
console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'no errors');
await b.close();
