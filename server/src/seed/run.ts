/**
 * CLI entry: `npm run seed` (idempotent upsert) or `npm run seed -- --reset` (wipe + reseed).
 * Add `--no-tickets` to skip the demo tickets.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { seedDatabase } from './seed.js';

const args = new Set(process.argv.slice(2));

await mongoose.connect(env.MONGODB_URI);
const summary = await seedDatabase({ reset: args.has('--reset'), demoTickets: !args.has('--no-tickets') });
// eslint-disable-next-line no-console
console.log('Seed complete:', summary);
console.log(`Author login:  <author email from dataset> / ${env.SEED_AUTHOR_PASSWORD}`);
console.log(`Admin logins:  admin@bookleaf.example, ops@bookleaf.example / ${env.SEED_ADMIN_PASSWORD}`);
await mongoose.disconnect();
