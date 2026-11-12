import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:2112', locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', trace: 'off' },
});
