import { test, expect } from '@playwright/test';
import { ENGLISH, login } from './helpers';

const PAGES: Record<string, string[]> = {
  admin: ['/', '/cau-hoi', '/cau-hoi/moi', '/duyet-cau-hoi', '/danh-muc', '/tao-de', '/de-thi', '/ket-qua', '/phan-tich', '/nguoi-dung', '/cau-hinh', '/nhat-ky', '/tro-ly-ai'],
  'ts.phamthi': ['/', '/thi', '/ket-qua-cua-toi'],
};

for (const [user, pages] of Object.entries(PAGES)) {
  test(`all pages render in Vietnamese without errors (${user})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await login(page, user);
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const text = await page.locator('body').innerText();
      // strip technical tokens that are allowed (codes, model ids, units)
      const cleaned = text.replace(/claude-[\w-]+|anthropic|PV-[A-Z]-\d+|DT-[\w-]+|IEC[\s\d-]+/g, '');
      const hit = cleaned.match(ENGLISH);
      expect(hit, `${path}: English label "${hit?.[0]}"`).toBeNull();
      expect(await page.locator('h1').first().innerText()).toMatch(/[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/i);
    }
    expect(errors).toEqual([]);
  });
}

test('unauthenticated users are redirected to login; candidates cannot open admin pages', async ({ page }) => {
  await page.goto('/cau-hoi');
  await expect(page).toHaveURL(/dang-nhap/);
  await login(page, 'ts.phamthi');
  await page.goto('/nguoi-dung');
  await expect(page.getByText('Bạn không có quyền truy cập trang này.')).toBeVisible();
});

test('wrong password shows a Vietnamese error', async ({ page }) => {
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill('admin');
  await page.getByLabel('Mật khẩu').fill('sai-mat-khau');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('alert')).toContainText('Tên đăng nhập hoặc mật khẩu không đúng');
});
