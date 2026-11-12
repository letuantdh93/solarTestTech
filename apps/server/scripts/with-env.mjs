#!/usr/bin/env node
/**
 * Run a command with variables from the project-root .env loaded (no dependencies,
 * works on any Node version). Variables already set in the environment win.
 *   node scripts/with-env.mjs prisma migrate deploy
 * ENV_FILE=/path/to/.env overrides the default location.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.resolve(here, '../../../.env');

if (fs.existsSync(envFile)) {
  for (const raw of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2];
    const q = value[0];
    if ((q === '"' || q === "'") && value.endsWith(q) && value.length >= 2) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, ''); // strip inline comments on unquoted values
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

if (!process.env.DATABASE_URL) {
  console.error(
    `\n[LỖI] Thiếu biến DATABASE_URL.\n` +
      `  • Không tìm thấy hoặc không đọc được tệp: ${envFile}\n` +
      `  • Tạo tệp từ mẫu:   cp .env.example .env   (tại thư mục gốc dự án) rồi sửa DATABASE_URL\n` +
      `  • Ví dụ: DATABASE_URL=postgresql://solar:<mật_khẩu>@127.0.0.1:5544/solar_exam?schema=public\n`,
  );
  process.exit(1);
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Cách dùng: node scripts/with-env.mjs <lệnh> [tham số...]');
  process.exit(1);
}
const child = spawn(cmd, args, { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 1)));
child.on('error', (e) => {
  console.error(`[LỖI] Không chạy được lệnh "${cmd}": ${e.message}`);
  process.exit(1);
});
