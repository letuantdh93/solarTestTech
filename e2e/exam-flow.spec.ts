import { test, expect, request } from '@playwright/test';
import { apiLogin, login } from './helpers';

test.describe('candidate examination flow', () => {
  let examId = '';
  const examName = `E2E – Kiểm tra nhanh ${Date.now()}`;
  test.beforeAll(async ({ baseURL }) => {
    const req = await request.newContext({ baseURL });
    const { headers } = await apiLogin(req, 'quanly');
    const bp = (await (await req.get('/api/blueprints')).json()).find((b: { isDefault: boolean }) => b.isDefault);
    const gen = await (await req.post('/api/exam-builder/generate', { data: { ...bp.config, totalQuestions: 10, categoryDistribution: bp.config.categoryDistribution.slice(0, 5).map((c: { categoryId: string }) => ({ categoryId: c.categoryId, count: 2 })), difficultyDistribution: { 1: 10, 2: 30, 3: 40, 4: 20 }, minCalculation: 0, minScenario: 0, seed: Date.now() % 100000 }, headers })).json();
    const exam = await (await req.post('/api/exams', { data: { name: examName, durationMinutes: 20, passingScore: 50, randomizeQuestions: true, randomizeOptions: true, maxAttempts: 1, resultVisibility: 'DETAILED', explanationVisibility: 'AFTER_SUBMIT', publicAccess: false, questionIds: gen.questionIds }, headers })).json();
    examId = exam.id;
    await req.post(`/api/exams/${examId}/status`, { data: { status: 'PUBLISHED' }, headers });
    const users = await (await req.get('/api/users?role=CANDIDATE&pageSize=100')).json();
    const target = users.items.find((u: { username: string }) => u.username === 'ts.dang');
    await req.post(`/api/exams/${examId}/assignments`, { data: { userIds: [target.id], groupIds: [] }, headers });
    await req.dispose();
  });

  test('take an exam on mobile with reduced motion: autosave, flag, navigate, reload, submit, see result', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await login(page, 'ts.dang');
    await page.goto('/thi');
    const card = page.locator('.card', { hasText: examName });
    await card.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Bắt đầu làm bài' }).click();
    await page.waitForURL(/\/thi\/lam-bai\//);
    await expect(page.getByRole('timer')).toBeVisible();

    // answer first 3 questions
    for (let i = 0; i < 3; i++) {
      await expect(page.locator('#q-title')).toContainText(`Câu ${i + 1}`);
      const opt = page.locator('[role=radio],[role=checkbox]').first();
      if (await opt.count()) await opt.click();
      else await page.getByLabel('Nhập kết quả').fill('12,5');
      if (i === 1) await page.getByRole('button', { name: 'Đánh dấu xem lại' }).click();
      await expect(page.getByText('Đã tự động lưu').filter({ visible: true })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Tiếp' }).click();
    }
    // reload → answers persisted (server-side autosave)
    page.once('dialog', (d) => d.accept());
    await page.reload();
    await page.getByRole('button', { name: /Danh sách câu/ }).click();
    await expect(page.getByRole('button', { name: /Câu 1: Đã trả lời/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Câu 2: Đã trả lời, Đánh dấu xem lại/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Câu 4: Chưa trả lời/ })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();

    await page.getByRole('button', { name: 'Nộp bài' }).last().click();
    await expect(page.getByRole('dialog')).toContainText('Bạn đã trả lời 3/10 câu');
    await page.getByRole('dialog').getByRole('button', { name: 'Nộp bài' }).click();
    await page.waitForURL(/\/ket-qua\/luot\//);
    await expect(page.getByRole('status').filter({ hasText: /ĐẠT|CHƯA ĐẠT/ })).toBeVisible();
    await expect(page.getByText('Số câu chưa trả lời').first()).toBeVisible();
    // no horizontal overflow on mobile
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('tablet layout of dashboard and question bank has no horizontal overflow', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    const page = await ctx.newPage();
    await login(page, 'quanly');
    for (const path of ['/', '/cau-hoi', '/phan-tich', '/de-thi']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  });

  test('dark theme toggle persists', async ({ page }) => {
    await login(page, 'admin');
    await page.getByRole('button', { name: /Giao diện/ }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: /Giao diện/ }).click();
  });
});
