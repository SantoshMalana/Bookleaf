import { expect, test } from '@playwright/test';
import { ANANYA, ARJUN, KAVITA, loginAs } from '../helpers';

test.describe('author portal: books & royalties', () => {
  test('Ananya sees her live book with an overdue-payout explanation', async ({ page }) => {
    await loginAs(page, 'author', ANANYA);
    await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'My Books' }).click();
    const card = page.locator('article', { hasText: 'Between Two Temples' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('978-93-5XXXX-05-9'); // ISBN
    await expect(card).toContainText('Historical Fiction');
    await expect(card).toContainText('₹425'); // MRP
    await expect(card).toContainText('67'); // copies sold
    await expect(card).toContainText('₹2,546'); // earned / pending
    await expect(card).toContainText('Published & Live');
    await expect(card).toContainText("hasn't been made yet"); // overdue, never paid
    await expect(page.getByText('In production')).toHaveCount(0); // no empty section
  });

  test('Kavita: a live book below the payout threshold + a book still in production', async ({ page }) => {
    await loginAs(page, 'author', KAVITA);
    await page.goto('/books');
    const live = page.locator('article', { hasText: 'The Nagpur Notebooks' });
    await expect(live).toContainText('below the ₹1,000 minimum'); // rollover, NOT overdue
    await expect(live).not.toContainText("hasn't been made yet");

    const prod = page.locator('article', { hasText: 'Raising Roots' });
    await expect(prod).toContainText('In Production - Typesetting');
    await expect(prod).toContainText('stage 4 of 9');
    await expect(prod).toContainText('Next: Proofreading');
    await expect(prod).toContainText('₹0'); // zero royalties before launch
    await expect(prod.getByText('—').first()).toBeVisible(); // unset fields render a dash, never "null"
    await expect(page.locator('body')).not.toContainText(/undefined|null|NaN/);
  });

  test('dashboard shows totals and the empty state for an author with no tickets', async ({ page }) => {
    await loginAs(page, 'author', ARJUN);
    await expect(page.getByText('No tickets yet')).toBeVisible();
    await page.goto('/tickets');
    await expect(page.getByText('You haven’t raised any tickets yet')).toBeVisible();
  });
});

test.describe('author portal: submit a query', () => {
  test('form validates inline, then submits and shows up in My Tickets', async ({ page }) => {
    await loginAs(page, 'author', ARJUN);
    await page.goto('/tickets/new');

    // book dropdown contains the author's own books + General (never another author's)
    await expect(page.locator('#book option')).toHaveCount(2); // General + Arjun's single book (waits for the books query)
    const options = await page.locator('#book option').allTextContents();
    expect(options[0]).toBe('General / Account Level');
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.join('|')).not.toContain('Between Two Temples'); // Ananya's book

    await page.getByRole('button', { name: 'Submit query' }).click();
    await expect(page.getByText('Please add a short subject')).toBeVisible();
    await expect(page.getByText('Please describe the issue in at least 10 characters')).toBeVisible();

    // attachment is UI-only: accepted client-side, only metadata is sent
    await page.locator('input[type=file]').setInputFiles({ name: 'statement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake') });
    await expect(page.getByText('statement.pdf')).toBeVisible();

    await page.locator('#book').selectOption({ index: 1 });
    await page.locator('#subject').fill('Cover colour looks different on the listing');
    await page.locator('#description').fill('The cover colours on Amazon look darker than the proof I approved. Could you check this?');
    await page.getByRole('button', { name: 'Submit query' }).click();

    await expect(page).toHaveURL(/\/tickets\/[a-f0-9]{24}$/);
    await expect(page.getByRole('heading', { name: 'Cover colour looks different on the listing' })).toBeVisible();
    await expect(page.getByText('Original query')).toBeVisible();
    await expect(page.getByText('statement.pdf')).toBeVisible();
    await expect(page.getByText(/received your query/i)).toBeVisible();

    await page.goto('/tickets');
    await expect(page.getByRole('link', { name: /Cover colour looks different/ })).toBeVisible();
  });

  test('"Ask about this book" pre-selects the book', async ({ page }) => {
    await loginAs(page, 'author', ANANYA);
    await page.goto('/books');
    await page.getByRole('link', { name: 'Ask about this book' }).first().click();
    await expect(page.locator('#book')).not.toHaveValue('');
    await expect(page.locator('#book option:checked')).toHaveText('Between Two Temples');
  });

  test('general / account-level query works without choosing a book', async ({ page }) => {
    await loginAs(page, 'author', ANANYA);
    await page.goto('/tickets/new');
    await page.locator('#subject').fill('Update my bank details');
    await page.locator('#description').fill('I changed my bank account and need to update where my royalties are sent.');
    await page.getByRole('button', { name: 'Submit query' }).click();
    await expect(page).toHaveURL(/\/tickets\/[a-f0-9]{24}$/);
    await expect(page.getByText('General / Account Level').first()).toBeVisible();
  });
});
