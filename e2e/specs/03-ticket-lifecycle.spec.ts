import { expect, test, type Page } from '@playwright/test';
import { ADMIN, ANANYA, loginAs } from '../helpers';

/**
 * The core journey from the brief, with two real browser sessions at once:
 * author raises a ticket → admin sees it triaged by AI → drafts, edits and replies →
 * the author sees the reply WITHOUT refreshing → internal notes never leak → follow-up,
 * resolve and reopen.
 */
test.describe.configure({ mode: 'serial' });

const SUBJECT = 'Royalty payout not received for last quarter';
let authorPage: Page;
let adminPage: Page;
let ticketUrl = '';
let adminTicketUrl = '';

test.beforeAll(async ({ browser, baseURL }) => {
  const a = await browser.newContext({ baseURL });
  const b = await browser.newContext({ baseURL });
  authorPage = await a.newPage();
  adminPage = await b.newPage();
  await loginAs(authorPage, 'author', ANANYA);
  await loginAs(adminPage, 'admin', ADMIN);
});

test.afterAll(async () => {
  await authorPage.context().close();
  await adminPage.context().close();
});

test('author submits a royalty query', async () => {
  await authorPage.goto('/tickets/new');
  await authorPage.locator('#subject').fill(SUBJECT);
  await authorPage.locator('#description').fill("I haven't received my royalty payment for the last quarter even though my book has sold copies. Please check.");
  await authorPage.getByRole('button', { name: 'Submit query' }).click();
  await expect(authorPage).toHaveURL(/\/tickets\/[a-f0-9]{24}$/);
  ticketUrl = authorPage.url();
  await expect(authorPage.getByText('Original query')).toBeVisible();
});

test('admin sees the new ticket arrive live and AI triage fills category + priority', async () => {
  await adminPage.goto('/admin');
  const row = adminPage.getByRole('row', { name: new RegExp(SUBJECT) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Royalty & Payments');
  await expect(row).toContainText('High'); // overdue royalty → at least High
  await expect(row.getByText('AI', { exact: true }).first()).toBeVisible();
  await expect(row).toContainText(/Due in|Overdue/); // SLA pill
});

test('queue filters work and live in the URL', async () => {
  await adminPage.goto('/admin');
  await adminPage.getByLabel('Category').selectOption('Royalty & Payments');
  await expect(adminPage).toHaveURL(/category=Royalty/);
  const rows = adminPage.locator('tbody tr');
  await expect(rows.first()).toBeVisible({ timeout: 15_000 }); // wait for the filtered result to render
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await expect(rows.nth(i)).toContainText('Royalty & Payments');

  await adminPage.getByLabel('Search tickets').fill('no-such-ticket-xyz');
  await expect(adminPage.getByText('No tickets match these filters')).toBeVisible();
  await adminPage.getByRole('button', { name: 'Clear filters' }).click();
  await expect(adminPage).toHaveURL(/\/admin$/);

  // stat tiles act as filters
  await adminPage.getByRole('button', { name: /Overdue/ }).click();
  await expect(adminPage).toHaveURL(/overdue=true/);
});

test('admin opens the ticket: AI draft is pre-filled, editable, with account facts', async () => {
  await adminPage.goto('/admin');
  await adminPage.getByRole('row', { name: new RegExp(SUBJECT) }).getByRole('link').click();
  adminTicketUrl = adminPage.url();
  await expect(adminPage.getByText('AI-drafted reply')).toBeVisible({ timeout: 15_000 });
  await expect(adminPage.getByText('Verify before sending')).toBeVisible();
  const editor = adminPage.getByLabel('Reply to author');
  await expect(editor).toHaveValue(/Hi Ananya/);
  await expect(editor).toHaveValue(/BookLeaf Publishing/); // signature appended
  // sidebar context
  await expect(adminPage.getByText('Between Two Temples').first()).toBeVisible();
});

test('admin can override category, priority and assign to self (recorded as manual)', async () => {
  await adminPage.getByLabel(/^Category/).selectOption('General Inquiry');
  await expect(adminPage.getByText('Manual').first()).toBeVisible();
  await adminPage.getByLabel(/^Category/).selectOption('Royalty & Payments');
  await adminPage.getByLabel(/^Priority/).selectOption('Critical');
  await expect(adminPage.locator('header, main').getByText('Critical').first()).toBeVisible();
  await adminPage.getByRole('button', { name: 'Assign to me' }).click();
  await expect(adminPage.getByText(/Assigned to\s+Riya Verma/).first()).toBeVisible();
  await expect(adminPage.getByText(/Priority Medium → Critical|Priority High → Critical/)).toBeVisible(); // event timeline
});

test('internal note is saved for admins only', async () => {
  await adminPage.getByRole('tab', { name: /Internal note/ }).click();
  await adminPage.getByLabel('Internal note').fill('SECRET-NOTE: finance confirmed the batch is on hold.');
  await adminPage.getByRole('button', { name: 'Save note' }).click();
  await expect(adminPage.getByText('SECRET-NOTE')).toBeVisible();
  await expect(adminPage.getByText('Internal — not visible to author')).toBeVisible();
  await adminPage.getByRole('tab', { name: /Reply to author/ }).click();
});

test('quick replies append to the editor, and Ctrl+Enter saves an internal note', async () => {
  const editor = adminPage.getByLabel('Reply to author');
  await expect(editor).toHaveValue(/Hi Ananya/);
  await adminPage.getByRole('button', { name: 'Looking into it' }).click();
  await expect(editor).toHaveValue(/We're looking into your account now and will update you here within 48 hours/);
  await expect(editor).toHaveValue(/Hi Ananya/); // appended, did not replace the AI draft

  await adminPage.getByRole('tab', { name: /Internal note/ }).click();
  await adminPage.getByLabel('Internal note').fill('SHORTCUT-NOTE saved with the keyboard.');
  await adminPage.getByLabel('Internal note').press('Control+Enter');
  await expect(adminPage.getByText('Internal note saved').first()).toBeVisible();
  await adminPage.getByRole('tab', { name: /Reply to author/ }).click();
  await adminPage.reload(); // start the next test from the freshly generated draft, not the appended snippet
  await expect(adminPage.getByLabel('Reply to author')).toHaveValue(/Hi Ananya/, { timeout: 15_000 });
});

test('admin edits the draft and sends — the author sees it live, with no refresh', async () => {
  await authorPage.goto(ticketUrl);
  await expect(authorPage.getByText('BookLeaf team')).toHaveCount(0);

  const editor = adminPage.getByLabel('Reply to author');
  await editor.fill((await editor.inputValue()) + '\n\nP.S. We have escalated this to finance (EDITED-BY-HUMAN).');
  await adminPage.getByRole('button', { name: 'Send reply' }).click();
  await expect(adminPage.getByText('Reply sent to the author')).toBeVisible();
  await expect(adminPage.getByText('AI draft, edited')).toBeVisible();

  // author tab was NOT reloaded
  await expect(authorPage.getByText('EDITED-BY-HUMAN')).toBeVisible({ timeout: 15_000 });
  await expect(authorPage.getByText('BookLeaf team').first()).toBeVisible();
  await expect(authorPage.getByText('New reply on')).toBeVisible(); // toast
  await expect(authorPage.getByText('In Progress').first()).toBeVisible();
});

test('internal notes, events and AI fields never reach the author', async () => {
  await authorPage.reload();
  await expect(authorPage.getByText('EDITED-BY-HUMAN')).toBeVisible();
  const text = await authorPage.locator('body').innerText();
  for (const leak of ['SECRET-NOTE', 'finance confirmed', 'Internal', 'triage', 'Critical', 'AI draft', 'Manual']) expect(text).not.toContain(leak);

  const id = ticketUrl.split('/').pop();
  const res = await authorPage.request.get(`/api/v1/tickets/${id}`);
  const raw = await res.text();
  for (const leak of ['SECRET-NOTE', 'priority', 'category', 'triage', 'aiAssist', 'assignedTo', '"internal"']) expect(raw).not.toContain(leak);
});

test('author follow-up reaches the admin live; admin "Send & resolve" reaches the author', async () => {
  await authorPage.goto(ticketUrl);
  await authorPage.getByLabel('Follow-up message').fill('Thanks! Please let me know once finance confirms.');
  await authorPage.getByRole('button', { name: 'Send' }).click();
  await expect(authorPage.getByText('Please let me know once finance confirms.')).toBeVisible();
  await expect(adminPage.getByText('Please let me know once finance confirms.')).toBeVisible({ timeout: 15_000 });

  await adminPage.getByLabel('Reply to author').fill('Finance has released the payment — you should see it within 2 working days.');
  await adminPage.getByRole('button', { name: 'Send & resolve' }).click();
  await expect(adminPage.getByText('Reply sent and ticket resolved')).toBeVisible();
  await expect(authorPage.getByText('Finance has released the payment')).toBeVisible({ timeout: 15_000 });
  await expect(authorPage.getByText('Resolved').first()).toBeVisible();

  // the author can now rate the resolution; the admin sees the rating
  await expect(authorPage.getByText('Was this answer helpful?')).toBeVisible();
  await authorPage.getByRole('button', { name: 'Yes, thank you' }).click();
  await expect(authorPage.getByText(/you said this was helpful/)).toBeVisible();
  await adminPage.reload();
  await expect(adminPage.getByText('Found the answer helpful')).toBeVisible();
});

test('author replying to a resolved ticket reopens it; closed tickets reject replies', async () => {
  await authorPage.getByLabel('Follow-up message').fill('I still do not see it in my account.');
  await authorPage.getByRole('button', { name: 'Send' }).click();
  await expect(authorPage.getByText('Open').first()).toBeVisible();

  await adminPage.goto(adminTicketUrl);
  await adminPage.getByLabel(/^Status/).selectOption('Closed');
  await expect(adminPage.getByText(/This ticket is closed/)).toBeVisible();

  await authorPage.reload();
  await expect(authorPage.getByText(/This ticket is closed/)).toBeVisible();
  await expect(authorPage.getByLabel('Follow-up message')).toHaveCount(0);
});

test('AI usage page reports the calls that just happened', async () => {
  await adminPage.goto('/admin/ai');
  await expect(adminPage.getByRole('heading', { name: /AI usage/ })).toBeVisible();
  await expect(adminPage.getByText('Configured', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('Auto-triage')).toBeVisible();
  await expect(adminPage.getByText('Draft replies')).toBeVisible();
});
