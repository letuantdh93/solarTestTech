import { buildApp } from './app';
import { config } from './config';
import { prisma } from './db';
import { purgeExpiredSessions } from './lib/auth';
import { runMaintenance } from './jobs';

const app = await buildApp();

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Background maintenance: purge sessions, auto-submit attempts whose deadline passed.
const timer = setInterval(() => {
  Promise.all([purgeExpiredSessions(), runMaintenance()]).catch((e) => app.log.error(e));
}, 30_000);

async function shutdown(sig: string) {
  app.log.info(`${sig} received, shutting down`);
  clearInterval(timer);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
