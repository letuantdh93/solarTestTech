import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import type { TestProject } from 'vitest/node';

function envFile() {
  const out: Record<string, string> = {};
  for (const line of readFileSync(new URL('../../../.env', import.meta.url), 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

/**
 * Creates a brand-new, uniquely named database for this test run (never touches
 * existing databases), applies migrations with `migrate deploy`, seeds it, and
 * drops only that ephemeral database on teardown.
 */
export default async function setup(project: TestProject) {
  const env = { ...envFile(), ...process.env } as Record<string, string>;
  const base = new URL(env.DATABASE_URL!);
  const dbName = `solar_exam_test_run_${Date.now()}_${process.pid}`;
  const adminUrl = new URL(base);
  adminUrl.pathname = '/postgres';
  const runUrl = new URL(base);
  runUrl.pathname = `/${dbName}`;

  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);

  const opts = {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'pipe' as const,
    env: { ...env, DATABASE_URL: runUrl.toString(), NODE_ENV: 'test' },
  };
  execSync('npx prisma migrate deploy', opts);
  execSync('npx tsx prisma/seed.ts', opts);
  project.provide('dbUrl', runUrl.toString());

  return async () => {
    // Drop only the ephemeral database created above.
    if (!dbName.startsWith('solar_exam_test_run_')) return;
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.$disconnect();
  };
}
