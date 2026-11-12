import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '../../..');

function num(v: string | undefined, d: number) {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v != null ? n : d;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: num(process.env.PORT, 2112),
  host: process.env.HOST ?? '0.0.0.0',
  sessionTtlHours: num(process.env.SESSION_TTL_HOURS, 12),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  uploadDir: path.resolve(ROOT_DIR, process.env.UPLOAD_DIR ?? './uploads'),
  webDist: path.resolve(ROOT_DIR, 'apps/web/dist'),
  maxUploadBytes: 5 * 1024 * 1024,
  loginRateLimit: num(process.env.LOGIN_RATE_LIMIT, 10),
  publicEntryRateLimit: num(process.env.PUBLIC_ENTRY_RATE_LIMIT, 10),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  aiModel: process.env.AI_MODEL || 'claude-opus-5-5',
  aiProvider: process.env.AI_PROVIDER ?? 'anthropic',
};
