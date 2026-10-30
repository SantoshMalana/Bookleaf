import { expect, test } from '@playwright/test';
import { ADMIN, ANANYA, loginAs } from '../helpers';

test.describe('authentication & role guards', () => {
  test('anonymous visitors are sent to the sign-in page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('wrong password shows a clear error and keeps the user on the form', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(ANANYA);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText(/invalid|incorrect/i);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('an author signs in, lands on their dashboard, and can sign out', async ({ page }) => {
    await loginAs(page, 'author', ANANYA);
    await expect(page.getByRole('heading', { name: /Welcome back, Ananya/ })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/books'); // session is really gone
    await expect(page).toHaveURL(/\/login$/);
  });

  test('an admin lands on the ticket queue', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Ticket queue' })).toBeVisible();
  });

  test('roles cannot cross over: authors cannot open /admin, admins are bounced from author pages', async ({ page }) => {
    await loginAs(page, 'author', ANANYA);
    await page.goto('/admin');
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await loginAs(page, 'admin', ADMIN);
    await page.goto('/books');
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('one-click demo accounts sign in (reviewer shortcut)', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /Riya Verma/ }).click();
    await expect(page.getByRole('heading', { name: 'Ticket queue' })).toBeVisible();
  });

  test('an unknown page shows a friendly 404 inside the app', async ({ page }) => {
    await page.goto('/definitely-not-a-page');
    // unauthenticated users are routed to login first; once signed in they see the 404
    await loginAs(page, 'author', ANANYA);
    await page.goto('/definitely-not-a-page');
    await expect(page.getByRole('heading', { name: /doesn.t exist/ })).toBeVisible();
  });
});
