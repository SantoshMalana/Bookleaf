import { expect, test } from '@playwright/test';
import { ADMIN, ANANYA, loginAs } from '../helpers';

/** Runs against a server with NO LLM configured: the product must still work end to end. */
test.describe.configure({ mode: 'serial' });

test('with the AI unavailable, tickets are still created and triaged by rules; admin replies from a template or by hand', async ({ browser, baseURL }) => {
  const authorCtx = await browser.newContext({ baseURL });
  const adminCtx = await browser.newContext({ baseURL });
  const author = await authorCtx.newPage();
  const admin = await adminCtx.newPage();
  await loginAs(author, 'author', ANANYA);
  await loginAs(admin, 'admin', ADMIN);

  // 1. creation is never blocked by the AI being down
  await author.goto('/tickets/new');
  await author.locator('#subject').fill('Legal action over unpaid royalty');
  await author.locator('#description').fill('I have not been paid for months. If this is not resolved I will consult my lawyer and take legal action.');
  await author.getByRole('button', { name: 'Submit query' }).click();
  await expect(author).toHaveURL(/\/tickets\/[a-f0-9]{24}$/);
  const ticketUrl = author.url();

  // 2. rule-based fallback classified it (and the badge says so); legal language forces Critical
  await admin.goto('/admin');
  const row = admin.getByRole('row', { name: /Legal action over unpaid royalty/ });
  await expect(row).toContainText('Royalty & Payments');
  await expect(row).toContainText('Critical');
  await expect(row.getByText('Rules', { exact: true }).first()).toBeVisible();

  // 3. the draft is a policy template, clearly labelled, still editable and sendable
  await row.getByRole('link').click();
  await expect(admin.getByText('Template reply (AI unavailable)')).toBeVisible({ timeout: 15_000 });
  const editor = admin.getByLabel('Reply to author');
  await expect(editor).not.toHaveValue('');
  await editor.fill('Hi Ananya, we take this seriously and our finance lead will call you today. — Riya');
  await admin.getByRole('button', { name: 'Send reply' }).click();
  await expect(admin.getByText('Reply sent to the author')).toBeVisible();

  // 4. author sees it live
  await expect(author.getByText('our finance lead will call you today')).toBeVisible({ timeout: 15_000 });
  await author.goto(ticketUrl);
  await expect(author.getByText('BookLeaf team').first()).toBeVisible();

  // 5. AI usage page tells the truth
  await admin.goto('/admin/ai');
  await expect(admin.getByText(/Not configured/)).toBeVisible();

  await authorCtx.close();
  await adminCtx.close();
});

test('health endpoint reports AI as not configured without failing', async ({ request }) => {
  const body = await (await request.get('/api/v1/health')).json();
  expect(body.status).toBe('ok');
  expect(body.ai.configured).toBe(false);
});
