import { test, expect, request } from '@playwright/test';
import { apiLogin } from './helpers';

test.describe('exam entry without login', () => {
  let code = '';
  let id = '';
  const examName = `E2E – Thi tự do ${Date.now()}`;
  test.beforeAll(async ({ baseURL }) => {
    const req = await request.newContext({ baseURL });
    const { headers } = await apiLogin(req, 'quanly');
    const bp = (await (await req.get('/api/blueprints')).json()).find((b: { isDefault: boolean }) => b.isDefault);
    const gen = await (await req.post('/api/exam-builder/generate', { data: { ...bp.config, seed: 4242 }, headers })).json();
    const exam = await (await req.post('/api/exams', { data: { name: examName, durationMinutes: 15, passingScore: 50, randomizeQuestions: true, randomizeOptions: true, maxAttempts: 1, resultVisibility: 'DETAILED', explanationVisibility: 'AFTER_SUBMIT', publicAccess: true, questionIds: gen.questionIds.slice(0, 5) }, headers })).json();
    code = exam.code; id = exam.id;
    await req.post(`/api/exams/${id}/status`, { data: { status: 'PUBLISHED' }, headers });
    await req.dispose();
  });
  test.afterAll(async ({ baseURL }) => {
    const req = await request.newContext({ baseURL });
    const { headers } = await apiLogin(req, 'quanly');
    await req.put(`/api/exams/${id}`, { data: { name: examName, durationMinutes: 15, passingScore: 50, randomizeQuestions: true, randomizeOptions: true, maxAttempts: 1, resultVisibility: 'DETAILED', explanationVisibility: 'AFTER_SUBMIT', publicAccess: false }, headers });
    await req.post(`/api/exams/${id}/status`, { data: { status: 'CLOSED' }, headers });
    await req.dispose();
  });

  test('anonymous visitor lands on the entry page; staff login link available', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/vao-thi$/);
    await expect(page.getByRole('heading', { name: 'Vào thi' })).toBeVisible();
    await expect(page.getByText(/chọn ngẫu nhiên 1 trong \d+ đề thi đang mở/)).toBeVisible();
    await page.getByRole('link', { name: 'Đăng nhập dành cho cán bộ quản lý' }).click();
    await expect(page).toHaveURL(/dang-nhap/);
  });

  test('enter name/phone/department on mobile, take the exam, see the result, finish', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const phone = `09${String(Date.now()).slice(-8)}`;
    await page.goto(`/vao-thi/${code}`);
    await expect(page.getByText(examName)).toBeVisible();
    // validation messages
    await page.getByLabel('Họ và tên').fill('A');
    await page.getByLabel('Số điện thoại').fill('123');
    await page.getByLabel('Phòng ban làm việc').fill('Phòng Kỹ thuật');
    await page.getByRole('button', { name: 'Vào thi' }).click();
    await expect(page.getByText('Số điện thoại không hợp lệ (10–11 chữ số, bắt đầu bằng 0)')).toBeVisible();
    await page.getByLabel('Họ và tên').fill('Ngô Thị Thu Hằng');
    await page.getByLabel('Số điện thoại').fill(phone);
    await page.getByRole('button', { name: 'Vào thi' }).click();
    await page.waitForURL(/\/thi\/lam-bai\//);
    await expect(page.getByText('Ngô Thị Thu Hằng')).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await expect(page.locator('#q-title')).toContainText(`Câu ${i + 1}`);
      const opt = page.locator('[role=radio],[role=checkbox]').first();
      if (await opt.count()) await opt.click(); else await page.getByLabel('Nhập kết quả').fill('10');
      await expect(page.getByText('Đã tự động lưu').filter({ visible: true })).toBeVisible();
      await page.getByRole('button', { name: 'Tiếp' }).click();
    }
    await page.getByRole('button', { name: 'Nộp bài' }).last().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Nộp bài' }).click();
    await page.waitForURL(/\/ket-qua\/luot\//);
    await expect(page.getByText('Thí sinh tự do')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /ĐẠT|CHƯA ĐẠT/ })).toBeVisible();
    // guest cannot reach staff/candidate pages
    await page.goto('/cau-hoi');
    await expect(page).toHaveURL(/\/vao-thi$/);
    // staff login link works while a candidate session is active
    await page.getByRole('link', { name: 'Đăng nhập dành cho cán bộ quản lý' }).click();
    await expect(page).toHaveURL(/dang-nhap/);
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
    await page.goBack();
    await page.goBack();
    await page.getByRole('button', { name: 'Kết thúc' }).click();
    await expect(page).toHaveURL(/\/vao-thi$/);
    // form is empty for the next person
    await expect(page.getByLabel('Số điện thoại')).toHaveValue('');
    // same phone, different name → clear error under the phone field, no exam started
    await page.getByLabel('Họ và tên').fill('Người Hoàn Toàn Khác');
    await page.getByLabel('Số điện thoại').fill(phone);
    await page.getByLabel('Phòng ban làm việc').fill('Phòng Kỹ thuật');
    await page.getByRole('button', { name: 'Vào thi' }).click();
    await expect(page.getByText(/đã được đăng ký với một họ tên khác/)).toBeVisible();
    await expect(page).toHaveURL(/\/vao-thi$/); // still on the entry page, no exam started
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
