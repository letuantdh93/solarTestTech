import type { APIRequestContext, Page } from '@playwright/test';

export const PW: Record<string, string> = { admin: 'Admin@Solar2025' };
export const pw = (u: string) => PW[u] ?? 'Demo@123456';

export async function login(page: Page, username: string) {
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.getByLabel('Mật khẩu').fill(pw(username));
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/dang-nhap'));
}

export async function apiLogin(req: APIRequestContext, username: string) {
  const r = await req.post('/api/auth/login', { data: { username, password: pw(username) } });
  if (!r.ok()) throw new Error(`login failed ${username}`);
  const state = await req.storageState();
  const csrf = state.cookies.find((c) => c.name === 'csrf_token')!.value;
  return { headers: { 'x-csrf-token': csrf } };
}

/** English UI words that must not appear on Vietnamese pages. */
export const ENGLISH = /\b(Dashboard|Submit|Cancel|Save|Loading|Delete|Edit|Search|Settings|Questions?|Exams?|Results?|Users?|Password|Login|Logout|Next|Previous|Back|Close|Confirm|Status|Actions?|Total|Score|Passed|Failed|Correct|Incorrect|Unanswered|Error|Warning)\b/;
