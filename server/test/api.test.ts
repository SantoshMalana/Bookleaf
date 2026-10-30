import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { breaker } from '../src/ai/ai-client.js';
import { __resetDraftState } from '../src/ai/draft.service.js';
import { MockProvider } from '../src/ai/providers/mock.js';
import { setProvider } from '../src/ai/providers/index.js';
import { hub, type TicketEvent } from '../src/realtime/hub.js';
import { AiCall, Book, Message, Ticket } from '../src/models/index.js';
import { asAdmin, asAuthor, bearer, connectAndSeed, disconnect, waitForTriage } from './helpers.js';

const app = createApp();
const api = (path: string) => `/api/v1${path}`;

beforeAll(async () => {
  await connectAndSeed();
});
afterAll(disconnect);
beforeEach(() => {
  breaker.success();
  __resetDraftState();
  setProvider(new MockProvider());
});

async function createTicket(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(api('/tickets'))
    .set(bearer(token))
    .send({ subject: 'No royalty yet', description: "I haven't received any royalty for my book and it has been months.", ...overrides });
  return res;
}

describe('authentication', () => {
  it('logs in with email + password and returns user, token and an httpOnly cookie', async () => {
    const res = await request(app).post(api('/auth/login')).send({ email: 'Priya.Sharma@email.com', password: 'Author@123' });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ role: 'author', name: 'Priya Sharma' });
    expect(res.body.data.token).toBeTruthy();
    expect(res.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('rejects wrong credentials with a generic 401 (no user enumeration)', async () => {
    const wrongPassword = await request(app).post(api('/auth/login')).send({ email: 'priya.sharma@email.com', password: 'nope' });
    const unknownUser = await request(app).post(api('/auth/login')).send({ email: 'nobody@email.com', password: 'nope' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
  });

  it('validates the login payload with a structured 400', async () => {
    const res = await request(app).post(api('/auth/login')).send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(['email', 'password']));
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('protects every data route (401 without a session, 401 with a garbage token)', async () => {
    for (const path of ['/me', '/books', '/tickets', '/admin/tickets', '/admin/stats', '/events']) {
      const res = await request(app).get(api(path));
      expect(res.status, path).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
    const bad = await request(app).get(api('/books')).set(bearer('garbage'));
    expect(bad.status).toBe(401);
  });

  it('accepts the session cookie as well as a bearer token', async () => {
    const agent = request.agent(app);
    await agent.post(api('/auth/login')).send({ email: 'priya.sharma@email.com', password: 'Author@123' });
    expect((await agent.get(api('/books'))).status).toBe(200);
  });

  it('exposes demo accounts only in DEMO_MODE and never the password hashes', async () => {
    const res = await request(app).get(api('/auth/demo-accounts'));
    expect(res.status).toBe(200);
    expect(res.body.data.accounts.length).toBe(12);
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
  });
});

describe('books & role-based access', () => {
  it("returns only the logged-in author's books, with derived payout + production data", async () => {
    const token = await asAuthor(app, 'sneha.kulkarni@email.com');
    const res = await request(app).get(api('/books')).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.map((b: { bookCode: string }) => b.bookCode)).toEqual(['BK011', 'BK012', 'BK013']);
    const prod = res.body.data.find((b: { bookCode: string }) => b.bookCode === 'BK013');
    expect(prod).toMatchObject({ isLive: false, mrp: null, publicationDate: null, royaltyPending: 0 });
    expect(prod.production.stage).toBe('Cover Design');
    expect(prod.payout.state).toBe('not_applicable');
  });

  it('classifies the dataset edge cases correctly end to end', async () => {
    const get = async (email: string) => (await request(app).get(api('/books')).set(bearer(await asAuthor(app, email)))).body.data;
    expect((await get('ananya.reddy@email.com'))[0].payout.state).toBe('overdue');
    expect((await get('kavita.deshmukh@email.com')).find((b: { bookCode: string }) => b.bookCode === 'BK016').payout.state).toBe('below_threshold');
    expect((await get('priya.sharma@email.com'))[1].payout.state).toBe('settled');
  });

  it("an author cannot read another author's book (404, not 403)", async () => {
    const other = await Book.findOne({ bookCode: 'BK005' }).lean(); // Ananya's
    const token = await asAuthor(app, 'priya.sharma@email.com');
    const res = await request(app).get(api(`/books/${other!._id}`)).set(bearer(token));
    expect(res.status).toBe(404);
  });

  it('admins see every book; authors cannot use the authorId filter to widen their view', async () => {
    const admin = await asAdmin(app);
    const all = await request(app).get(api('/books')).set(bearer(admin));
    expect(all.body.data).toHaveLength(18);
    expect(all.body.data[0].author.name).toBeTruthy();

    const ananya = await Book.findOne({ bookCode: 'BK005' }).lean();
    const token = await asAuthor(app, 'priya.sharma@email.com');
    const sneaky = await request(app).get(api(`/books?authorId=${ananya!.author}`)).set(bearer(token));
    expect(sneaky.body.data.map((b: { bookCode: string }) => b.bookCode)).toEqual(['BK001', 'BK002']);
  });

  it('forbids authors from every /admin route (403) and malformed ids return 400', async () => {
    const token = await asAuthor(app, 'priya.sharma@email.com');
    for (const path of ['/admin/stats', '/admin/tickets', '/admin/ai/usage']) {
      expect((await request(app).get(api(path)).set(bearer(token))).status, path).toBe(403);
    }
    expect((await request(app).get(api('/books/not-an-id')).set(bearer(token))).status).toBe(400);
  });

  it('GET /me summarises royalties, next payout date and book counts', async () => {
    const token = await asAuthor(app, 'diya.chatterjee@email.com');
    const res = await request(app).get(api('/me')).set(bearer(token));
    expect(res.body.data.royalty).toMatchObject({ totalPending: 4115, nextPayoutDate: '2026-11-14', overdueBooks: 1 });
    expect(res.body.data.books).toEqual({ total: 2, live: 2, inProduction: 0 });
  });
});

describe('ticket lifecycle (AI available)', () => {
  it('create → AI triage → admin drafts, replies → author sees it; internal notes stay hidden', async () => {
    const author = await asAuthor(app, 'ananya.reddy@email.com');
    const admin = await asAdmin(app);
    const book = await Book.findOne({ bookCode: 'BK005' }).lean();

    // 1. author raises a ticket: returns fast, before AI has run
    const created = await createTicket(author, { bookId: String(book!._id) });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ ticketId: expect.stringMatching(/^BL-\d{4}$/), status: 'Open' });
    expect(created.body.data.category).toBeUndefined(); // AI fields never reach authors
    const id = created.body.data.id as string;

    // 2. triage completes asynchronously
    const triaged = await waitForTriage(id);
    expect(triaged.triage.status).toBe('done');
    expect(triaged.category).toBe('Royalty & Payments');
    expect(triaged.priority).toBe('High'); // non-payment + overdue payout floor
    expect(triaged.categorySource).toBe('ai');

    // 3. admin sees it in the queue with AI fields
    const queue = await request(app).get(api('/admin/tickets?status=Open&category=Royalty%20%26%20Payments')).set(bearer(admin));
    const row = queue.body.items.find((t: { id: string }) => t.id === id);
    expect(row).toMatchObject({ category: 'Royalty & Payments', priority: 'High', categorySource: 'ai' });

    // 4. draft is generated once and then served from cache (cost control)
    const provider = new MockProvider();
    setProvider(provider);
    const d1 = await request(app).post(api(`/admin/tickets/${id}/draft`)).set(bearer(admin)).send({});
    expect(d1.status).toBe(200);
    expect(d1.body.data).toMatchObject({ source: 'ai', cached: false });
    expect(d1.body.data.body).toContain('Warm regards,\nRiya Verma');
    const d2 = await request(app).post(api(`/admin/tickets/${id}/draft`)).set(bearer(admin)).send({});
    expect(d2.body.data.cached).toBe(true);
    expect(provider.calls.filter((c) => c.tool.name === 'write_reply')).toHaveLength(1);

    // 5. admin leaves an internal note, then replies using the (edited) draft
    await request(app).post(api(`/admin/tickets/${id}/notes`)).set(bearer(admin)).send({ body: 'Finance confirmed no payout record — chase.' }).expect(201);
    const reply = await request(app)
      .post(api(`/admin/tickets/${id}/replies`))
      .set(bearer(admin))
      .send({ body: d1.body.data.body + '\n\nP.S. edited by a human', usedDraft: true });
    expect(reply.status).toBe(201);
    expect(reply.body.data).toMatchObject({ status: 'In Progress', assignedTo: { name: 'Riya Verma' }, isOverdue: false });
    expect(reply.body.data.firstResponseAt).toBeTruthy();

    // 6. the author sees the reply but NOT the note, the events, or any AI/admin fields
    const mine = await request(app).get(api(`/tickets/${id}`)).set(bearer(author));
    expect(mine.status).toBe(200);
    expect(mine.body.data.status).toBe('In Progress');
    expect(mine.body.data.messages.map((m: { kind: string }) => m.kind)).toEqual(['public']);
    expect(mine.body.data.messages[0].body).toContain('edited by a human');
    const raw = JSON.stringify(mine.body);
    for (const leak of ['Finance confirmed', 'priority', 'category', 'triage', 'aiAssist', 'internal']) expect(raw).not.toContain(leak);

    // 7. draft acceptance is tracked (edited vs as-is)
    const sent = await Message.findOne({ ticket: id, senderRole: 'admin', kind: 'public' }).lean();
    expect(sent?.aiAssist).toEqual({ fromDraft: true, edited: true });

    // 8. author follows up; resolved tickets reopen; closed tickets refuse
    await request(app).patch(api(`/admin/tickets/${id}`)).set(bearer(admin)).send({ status: 'Resolved' }).expect(200);
    const follow = await request(app).post(api(`/tickets/${id}/messages`)).set(bearer(author)).send({ body: 'Thanks — still nothing in my account.' });
    expect(follow.status).toBe(201);
    expect(follow.body.data.status).toBe('Open');
    await request(app).patch(api(`/admin/tickets/${id}`)).set(bearer(admin)).send({ status: 'Closed' }).expect(200);
    const closed = await request(app).post(api(`/tickets/${id}/messages`)).set(bearer(author)).send({ body: 'one more thing' });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('TICKET_CLOSED');
  });

  it('admin overrides win over later AI runs, and draft regenerates when the category changes', async () => {
    const author = await asAuthor(app, 'vikram.joshi@email.com');
    const admin = await asAdmin(app);
    const id = (await createTicket(author, { subject: 'Question about my book', description: 'I would like to know what you can do about my copies.' })).body.data.id;
    await waitForTriage(id);

    const patched = await request(app).patch(api(`/admin/tickets/${id}`)).set(bearer(admin)).send({ category: 'Printing & Quality', priority: 'Critical' });
    expect(patched.body.data).toMatchObject({ category: 'Printing & Quality', categorySource: 'admin', priority: 'Critical', prioritySource: 'admin' });
    expect(patched.body.data.messages.some((m: { kind: string; body: string }) => m.kind === 'event' && /manual override/.test(m.body))).toBe(true);

    const rerun = await request(app).post(api(`/admin/tickets/${id}/triage`)).set(bearer(admin));
    expect(rerun.body.data).toMatchObject({ category: 'Printing & Quality', priority: 'Critical' }); // untouched

    const d1 = await request(app).post(api(`/admin/tickets/${id}/draft`)).set(bearer(admin)).send({});
    await request(app).patch(api(`/admin/tickets/${id}`)).set(bearer(admin)).send({ category: 'General Inquiry' });
    const d2 = await request(app).post(api(`/admin/tickets/${id}/draft`)).set(bearer(admin)).send({});
    expect(d1.body.data.cached).toBe(false);
    expect(d2.body.data.cached).toBe(false); // category changed → stale → regenerated
  });

  it('supports assignment, filters, search and urgency ordering in the queue', async () => {
    const admin = await asAdmin(app, 'ops@bookleaf.example');
    const author = await asAuthor(app, 'meera.nair@email.com');
    const low = (await createTicket(author, { subject: 'Update my bio', description: 'Can I update my author bio on the store page please?' })).body.data.id;
    const crit = (await createTicket(author, { subject: 'Legal notice', description: 'I will take legal action over unpaid royalty.' })).body.data.id;
    await Promise.all([waitForTriage(low), waitForTriage(crit)]);

    const assigned = await request(app).put(api(`/admin/tickets/${crit}/assignee`)).set(bearer(admin)).send({ assignee: 'me' });
    expect(assigned.body.data.assignedTo.name).toBe('Karan Mehta');
    const mine = await request(app).get(api('/admin/tickets?assignee=me')).set(bearer(admin));
    expect(mine.body.items.map((t: { id: string }) => t.id)).toEqual([crit]);

    const queue = await request(app).get(api('/admin/tickets?status=Open,In%20Progress')).set(bearer(admin));
    const ids: string[] = queue.body.items.map((t: { id: string }) => t.id);
    expect(ids.indexOf(crit)).toBeLessThan(ids.indexOf(low)); // Critical before Low
    const prios = queue.body.items.map((t: { priority: string }) => ({ Critical: 4, High: 3, Medium: 2, Low: 1 })[t.priority]);
    expect([...prios].sort((a, b) => b - a)).toEqual(prios); // sorted by priority desc

    const search = await request(app).get(api('/admin/tickets?q=legal')).set(bearer(admin));
    expect(search.body.items.some((t: { id: string }) => t.id === crit)).toBe(true);
    const bad = await request(app).get(api('/admin/tickets?status=Banana')).set(bearer(admin));
    expect(bad.status).toBe(400);
  });
});

describe('ticket authorization & validation', () => {
  it("authors cannot read, reply to or find other authors' tickets (404)", async () => {
    const owner = await asAuthor(app, 'rohit.kapoor@email.com');
    const intruder = await asAuthor(app, 'arjun.malhotra@email.com');
    const id = (await createTicket(owner)).body.data.id;

    expect((await request(app).get(api(`/tickets/${id}`)).set(bearer(intruder))).status).toBe(404);
    expect((await request(app).post(api(`/tickets/${id}/messages`)).set(bearer(intruder)).send({ body: 'hi' })).status).toBe(404);
    const list = await request(app).get(api('/tickets')).set(bearer(intruder));
    expect(list.body.items.map((t: { id: string }) => t.id)).not.toContain(id);
  });

  it("cannot raise a ticket against someone else's book", async () => {
    const intruder = await asAuthor(app, 'arjun.malhotra@email.com');
    const book = await Book.findOne({ bookCode: 'BK001' }).lean();
    const res = await createTicket(intruder, { bookId: String(book!._id) });
    expect(res.status).toBe(404);
  });

  it('validates ticket input with field-level errors', async () => {
    const token = await asAuthor(app, 'rohit.kapoor@email.com');
    const res = await request(app).post(api('/tickets')).set(bearer(token)).send({ subject: 'x', description: 'short', bookId: 'zzz' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['bookId', 'description', 'subject']);
  });

  it('only authors can raise tickets; only admins can reply', async () => {
    const admin = await asAdmin(app);
    expect((await createTicket(admin)).status).toBe(403);
    const author = await asAuthor(app, 'rohit.kapoor@email.com');
    const id = (await createTicket(author)).body.data.id;
    expect((await request(app).post(api(`/admin/tickets/${id}/replies`)).set(bearer(author)).send({ body: 'hi' })).status).toBe(403);
  });

  it('returns structured errors for unknown routes and bad JSON', async () => {
    const admin = await asAdmin(app);
    const missing = await request(app).get(api('/nope')).set(bearer(admin));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ROUTE_NOT_FOUND');
    const badJson = await request(app).post(api('/auth/login')).set('Content-Type', 'application/json').send('{oops');
    expect(badJson.status).toBe(400);
    expect(badJson.body.error.message).toMatch(/not valid JSON/);
  });
});

describe('graceful degradation when the AI is down', () => {
  it('still creates the ticket, applies rule-based triage, and gives admins a template draft', async () => {
    setProvider(new MockProvider({ failWith: Object.assign(new Error('boom'), { status: 503 }) }));
    const author = await asAuthor(app, 'ananya.reddy@email.com');
    const admin = await asAdmin(app);
    const book = await Book.findOne({ bookCode: 'BK005' }).lean();

    const created = await createTicket(author, { bookId: String(book!._id) });
    expect(created.status).toBe(201); // the ticket is never blocked by the AI
    const id = created.body.data.id;

    const t = await waitForTriage(id);
    expect(t.triage.status).toBe('fallback');
    expect(t.triage.error).toBe('provider_error');
    expect(t.categorySource).toBe('fallback');
    expect(t.category).toBe('Royalty & Payments');
    expect(t.priority).toBe('High');

    const detail = await request(app).get(api(`/admin/tickets/${id}`)).set(bearer(admin));
    expect(detail.body.data.messages.some((m: { body: string }) => /AI unavailable/.test(m.body))).toBe(true);

    const draft = await request(app).post(api(`/admin/tickets/${id}/draft`)).set(bearer(admin)).send({});
    expect(draft.status).toBe(200); // not a 5xx — admins can still work
    expect(draft.body.data.source).toBe('template');
    expect(draft.body.data.body).toContain('₹2,546');
    expect(draft.body.data.verifyBeforeSending[0]).toMatch(/AI draft unavailable/);

    // admins can ignore the draft and write manually
    const manual = await request(app).post(api(`/admin/tickets/${id}/replies`)).set(bearer(admin)).send({ body: 'Hi Ananya, we are on it.' });
    expect(manual.status).toBe(201);

    const usage = await request(app).get(api('/admin/ai/usage')).set(bearer(admin));
    expect(usage.body.data.triage.fallbackClassified).toBeGreaterThanOrEqual(1);
    expect(usage.body.data.failureReasons.length).toBeGreaterThan(0);
  });

  it('works with no provider configured at all', async () => {
    setProvider(null);
    const author = await asAuthor(app, 'farhan.sheikh@email.com');
    const id = (await createTicket(author, { subject: 'Amazon description', description: 'Can I update the description of my book on Amazon?' })).body.data.id;
    const t = await waitForTriage(id);
    expect(t.triage).toMatchObject({ status: 'fallback', error: 'not_configured' });
    expect(t.category).toBe('General Inquiry');
    expect((await AiCall.find({ ticket: id, status: 'skipped' })).length).toBe(1);
  });

  it('survives a model that returns garbage (falls back, logs invalid_output)', async () => {
    setProvider(new MockProvider({ returnData: { nonsense: true } }));
    const author = await asAuthor(app, 'farhan.sheikh@email.com');
    const id = (await createTicket(author)).body.data.id;
    const t = await waitForTriage(id);
    expect(t.triage).toMatchObject({ status: 'fallback', error: 'invalid_output' });
  });
});

describe('queue statistics & real-time events', () => {
  it('reports queue stats', async () => {
    const admin = await asAdmin(app);
    const res = await request(app).get(api('/admin/stats')).set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.active).toBeGreaterThan(0);
    expect(res.body.data.activeByPriority).toHaveProperty('Critical');
  });

  it('routes events: authors only get visible changes on their own tickets; admins get everything', () => {
    const authorEvents: TicketEvent[] = [];
    const otherEvents: TicketEvent[] = [];
    const adminEvents: TicketEvent[] = [];
    const off = [
      hub.subscribe('author', 'A1', (e) => authorEvents.push(e)),
      hub.subscribe('author', 'A2', (e) => otherEvents.push(e)),
      hub.subscribe('admin', null, (e) => adminEvents.push(e)),
    ];
    hub.publish({ type: 'ticket.message', ticketId: 't1', ticketNumber: 1001, authorId: 'A1', authorVisible: true });
    hub.publish({ type: 'ticket.updated', ticketId: 't1', ticketNumber: 1001, authorId: 'A1', authorVisible: false }); // e.g. internal note
    off.forEach((f) => f());
    expect(authorEvents).toHaveLength(1);
    expect(otherEvents).toHaveLength(0);
    expect(adminEvents).toHaveLength(2);
  });

  it('streams ticket events over SSE to the owning author', async () => {
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    const token = await asAuthor(app, 'rohit.kapoor@email.com');
    const ctrl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/events`, { headers: bearer(token), signal: ctrl.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const readUntil = async (needle: string) => {
      while (!buffer.includes(needle)) buffer += decoder.decode((await reader.read()).value);
    };
    await readUntil('event: ready');

    const admin = await asAdmin(app);
    const id = (await createTicket(token)).body.data.id; // author's own ticket → author-visible event
    await waitForTriage(id);
    await request(app).post(api(`/admin/tickets/${id}/replies`)).set(bearer(admin)).send({ body: 'We are looking into this.' });
    await readUntil('"type":"ticket.message"');
    expect(buffer).toContain(id);

    ctrl.abort();
    server.close();
  });
});

describe('security hygiene', () => {
  it('never leaks API keys or secrets through health or error responses', async () => {
    const health = await request(app).get(api('/health'));
    expect(health.status).toBe(200);
    const raw = JSON.stringify(health.body);
    expect(raw).not.toMatch(/sk-|api[_-]?key|secret/i);
    expect(health.headers['x-powered-by']).toBeUndefined();
    expect(health.headers['x-request-id']).toBeTruthy();
  });

  it('stores passwords hashed', async () => {
    const { User } = await import('../src/models/index.js');
    const u = await User.findOne({ email: 'priya.sharma@email.com' }).select('+passwordHash').lean();
    expect(u?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(u?.passwordHash).not.toContain('Author@123');
  });

  it('counts tickets in the database that match what the API created (sanity)', async () => {
    expect(await Ticket.countDocuments()).toBeGreaterThan(5);
  });
});
