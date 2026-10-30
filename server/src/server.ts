import mongoose from 'mongoose';
import { recoverPendingTriage } from './ai/triage.service.js';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { seedIfEmpty } from './seed/seed.js';

async function main() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  logger.info('connected to MongoDB');

  if (env.AUTO_SEED) {
    const seeded = await seedIfEmpty();
    if (seeded) logger.info(seeded, 'empty database — seeded with the BookLeaf sample dataset');
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, ai: env.llm.provider === 'none' ? 'disabled (rule-based fallback only)' : `${env.llm.provider}/${env.llm.model}` },
      'BookLeaf portal API listening',
    );
  });

  // Sweep up tickets whose async triage was interrupted by a restart, now and every minute.
  const sweep = () => recoverPendingTriage().catch((err) => logger.error({ err }, 'triage recovery failed'));
  void sweep();
  const timer = setInterval(sweep, 60_000);
  timer.unref();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    clearInterval(timer);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
