import { expect, test } from '@playwright/test';
import { ADMIN, ADMIN_PW, ANANYA, ARJUN, AUTHOR_PW, apiToken, bearer } from '../helpers';

test.describe('API: authentication, RBAC, isolation, validation', () => {
  test('health is public; everything else requires auth', async ({ request }) => {
    expect((await request.get('/api/v1/health')).ok()).toBeTruthy();
    for (const path of ['/me', '/books', '/tickets', '/admin/tickets', '/admin/stats', '/admin/ai/usage']) {
      const res = await request.get(`/api/v1${path}`);
      expect(res.status(), path).toBe(401);
      expect((await res.json()).error.code).toBe('UNAUTHENTICATED');
    }
  });

  test('garbage / tampered tokens are rejected', async ({ request }) => {
    const res = await request.get('/api/v1/me', { headers: bearer('not.a.jwt') });
    expect(res.status()).toBe(401);
    const real = await apiToken(request, ANANYA, AUTHOR_PW);
    const tampered = real.slice(0, -4) + (real.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect((await request.get('/api/v1/me', { headers: bearer(tampered) })).status()).toBe(401);
  });

  test('authors cannot use admin endpoints (403), admins can', async ({ request }) => {
    const author = await apiToken(request, ANANYA, AUTHOR_PW);
    for (const path of ['/admin/tickets', '/admin/stats', '/admin/ai/usage']) {
      expect((await request.get(`/api/v1${path}`, { headers: bearer(author) })).status(), path).toBe(403);
    }
    const admin = await apiToken(request, ADMIN, ADMIN_PW);
    expect((await request.get('/api/v1/admin/tickets', { headers: bearer(admin) })).status()).toBe(200);
  });

  test('an author only ever sees their own books', async ({ request }) => {
    const token = await apiToken(request, ANANYA, AUTHOR_PW);
    const { data } = await (await request.get('/api/v1/books', { headers: bearer(token) })).json();
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Between Two Temples');
    expect(data[0].payout.state).toBe('overdue');
  });

  test('cross-author access is a 404 (not 403) for tickets, messages and books', async ({ request }) => {
    const ananya = await apiToken(request, ANANYA, AUTHOR_PW);
    const arjun = await apiToken(request, ARJUN, AUTHOR_PW);

    const mine = await (await request.get('/api/v1/tickets', { headers: bearer(ananya) })).json();
    expect(mine.items.length).toBeGreaterThan(0);
    const ticketId = mine.items[0].id;
    const ananyaBook = (await (await request.get('/api/v1/books', { headers: bearer(ananya) })).json()).data[0].id;

    expect((await request.get(`/api/v1/tickets/${ticketId}`, { headers: bearer(arjun) })).status()).toBe(404);
    expect((await request.post(`/api/v1/tickets/${ticketId}/messages`, { headers: bearer(arjun), data: { body: 'hello' } })).status()).toBe(404);
    expect((await request.get(`/api/v1/books/${ananyaBook}`, { headers: bearer(arjun) })).status()).toBe(404);
    const stolen = await request.post('/api/v1/tickets', { headers: bearer(arjun), data: { bookId: ananyaBook, subject: 'Not my book', description: 'Trying to attach a ticket to another author book' } });
    expect(stolen.status()).toBe(404);

    // and Arjun's list never contains Ananya's tickets
    const theirs = await (await request.get('/api/v1/tickets?limit=100', { headers: bearer(arjun) })).json();
    expect(theirs.items.map((t: any) => t.id)).not.toContain(ticketId);
  });

  test('input validation returns meaningful 400s with field details (never a bare 500)', async ({ request }) => {
    const token = await apiToken(request, ANANYA, AUTHOR_PW);
    const bad = await request.post('/api/v1/tickets', { headers: bearer(token), data: { subject: 'x', description: 'short' } });
    expect(bad.status()).toBe(400);
    const body = await bad.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((d: any) => d.path)).toEqual(expect.arrayContaining(['subject', 'description']));
    expect(body.error.requestId).toBeTruthy();

    expect((await request.get('/api/v1/tickets/not-an-id', { headers: bearer(token) })).status()).toBe(400);
    expect((await request.get('/api/v1/tickets?status=Nonsense', { headers: bearer(token) })).status()).toBe(400);
    expect((await request.post('/api/v1/auth/login', { data: { email: 'nope' } })).status()).toBe(400);
    expect((await request.get('/api/v1/definitely/not/a/route', { headers: bearer(token) })).status()).toBe(404);
  });

  test('login does not reveal whether an email exists', async ({ request }) => {
    const a = await request.post('/api/v1/auth/login', { data: { email: 'ghost@nowhere.example', password: 'whatever123' } });
    const b = await request.post('/api/v1/auth/login', { data: { email: ANANYA, password: 'wrong-password' } });
    expect(a.status()).toBe(401);
    expect(b.status()).toBe(401);
    expect((await a.json()).error.message).toBe((await b.json()).error.message);
  });

  test('admin cannot write as an author, and authors cannot send admin replies', async ({ request }) => {
    const admin = await apiToken(request, ADMIN, ADMIN_PW);
    const author = await apiToken(request, ANANYA, AUTHOR_PW);
    const list = await (await request.get('/api/v1/admin/tickets?limit=1', { headers: bearer(admin) })).json();
    const id = list.items[0].id;
    expect((await request.post('/api/v1/tickets', { headers: bearer(admin), data: { subject: 'abc', description: 'admin trying to raise a ticket' } })).status()).toBe(403);
    expect((await request.post(`/api/v1/admin/tickets/${id}/replies`, { headers: bearer(author), data: { body: 'sneaky' } })).status()).toBe(403);
    expect((await request.patch(`/api/v1/admin/tickets/${id}`, { headers: bearer(author), data: { priority: 'Low' } })).status()).toBe(403);
  });

  test('API docs and OpenAPI spec are served', async ({ request }) => {
    const spec = await (await request.get('/api/openapi.json')).json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths).length).toBeGreaterThan(10);
    expect((await request.get('/api/docs/')).ok()).toBeTruthy();
  });
});
