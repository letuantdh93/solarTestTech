// Screenshot helper: node scripts/shots.mjs <user> <password> <outDir> <path[@w]>...
import { chromium } from '@playwright/test';
const [user, pass, out, ...paths] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://127.0.0.1:2112';
const browser = await chromium.launch();
const errors = [];
for (const spec of paths) {
  const [path, w] = spec.split('@');
  const width = Number(w ?? 1440);
  const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 860 : 900 }, locale: 'vi-VN', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${path}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${path}: console ${m.text()}`));
  if (user !== '-') {
    await page.goto(base + '/dang-nhap');
    await page.fill('input[autocomplete=username]', user);
    await page.fill('input[autocomplete=current-password]', pass);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => !u.pathname.startsWith('/dang-nhap'));
  }
  await page.goto(base + path);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  const name = `${out}/${(path.replace(/\W+/g, '_') || 'root')}_${width}.png`;
  await page.screenshot({ path: name, fullPage: process.env.FULL !== '0' });
  console.log(name);
  await ctx.close();
}
await browser.close();
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
