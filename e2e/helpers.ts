import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const AUTHOR_PW = 'Author@123';
export const ADMIN_PW = 'Admin@123';
export const ADMIN = 'admin@bookleaf.example';
export const ANANYA = 'ananya.reddy@email.com'; // never paid, ₹2,546 pending → overdue
export const KAVITA = 'kavita.deshmukh@email.com'; // below ₹1,000 threshold + a book in typesetting
export const SNEHA = 'sneha.kulkarni@email.com'; // has a book in cover design
export const ARJUN = 'arjun.malhotra@email.com'; // no tickets in the seed (empty state), 2nd author for isolation checks

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function loginAs(page: Page, who: 'admin' | 'author', email = ADMIN) {
  await login(page, email, who === 'admin' ? ADMIN_PW : AUTHOR_PW);
  await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeVisible();
}

/** Log in through the API and return the Bearer token (for direct API assertions). */
export async function apiToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post('/api/v1/auth/login', { data: { email, password } });
  expect(res.ok(), `login ${email}`).toBeTruthy();
  const body = await res.json();
  return body.data.token as string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
