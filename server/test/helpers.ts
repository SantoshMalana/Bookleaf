import mongoose from 'mongoose';
import request from 'supertest';
import type { Express } from 'express';
import { Ticket } from '../src/models/index.js';
import { seedDatabase } from '../src/seed/seed.js';

export async function connectAndSeed(opts: { demoTickets?: boolean } = {}): Promise<void> {
  if (mongoose.connection.readyState !== 1) await mongoose.connect(process.env.MONGODB_URI!);
  await seedDatabase({ reset: true, demoTickets: opts.demoTickets ?? false });
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
}

export async function login(app: Express, email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.token as string;
}

export const asAuthor = (app: Express, email: string) => login(app, email, 'Author@123');
export const asAdmin = (app: Express, email = 'admin@bookleaf.example') => login(app, email, 'Admin@123');
export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Polls until the async triage job has finished for a ticket. */
export async function waitForTriage(ticketId: string, timeoutMs = 5000) {
  const start = Date.now();
  for (;;) {
    const t = await Ticket.findById(ticketId).lean();
    if (t && t.triage.status !== 'pending') return t;
    if (Date.now() - start > timeoutMs) throw new Error('triage did not finish in time');
    await new Promise((r) => setTimeout(r, 25));
  }
}
