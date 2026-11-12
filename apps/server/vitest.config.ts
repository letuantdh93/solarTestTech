import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    setupFiles: ['./test/setup-env.ts'],
    env: { NODE_ENV: 'test', ANTHROPIC_API_KEY: '', SEED_ADMIN_PASSWORD: 'Admin@Solar2025', LOGIN_RATE_LIMIT: '1000', PUBLIC_ENTRY_RATE_LIMIT: '1000', AI_PROVIDER: 'mock' },
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
