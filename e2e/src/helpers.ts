import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

export interface E2EUser {
  readonly username: string;
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

export function uniqueId(): string {
  return randomUUID().replaceAll('-', '').slice(0, 8);
}

export function createIsolatedUser(label: 'a' | 'b', id: string): E2EUser {
  return {
    username: `e2e${label}${id}`,
    email: `e2e${label}${id}@example.com`,
    password: 'secure-password',
    displayName: `E2E ${label.toUpperCase()} ${id}`,
  };
}

export async function registerUser(page: Page, user: E2EUser): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Display name').fill(user.displayName);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app(?:\/|$)/);
  await waitUntilConnected(page);
}

export async function loginUser(page: Page, user: E2EUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app(?:\/|$)/);
  await waitUntilConnected(page);
}

export async function waitUntilConnected(page: Page): Promise<void> {
  await expect(page.getByText('Connected', { exact: true }).first()).toBeVisible();
}

export async function createRoom(
  page: Page,
  name: string,
  type: 'Public' | 'Private' = 'Public',
): Promise<string> {
  const form = page.getByRole('form', { name: 'Create a room' });
  await form.getByLabel('Room name').fill(name);
  await form.getByLabel('Room type').selectOption({ label: type });
  await form.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await waitUntilConnected(page);
  const match = /\/app\/rooms\/([a-fA-F0-9]{24})/.exec(page.url());
  if (match?.[1] === undefined) {
    throw new Error(`Expected to land on a room URL, received ${page.url()}`);
  }

  return match[1];
}

export async function sendMessage(page: Page, content: string): Promise<void> {
  const composer = page.getByRole('form', { name: 'Send a message' });
  await composer.getByRole('textbox', { name: 'Message' }).fill(content);
  await composer.getByRole('button', { name: 'Send' }).click();
}

export function messageArticle(page: Page, content: string) {
  return page.getByRole('log', { name: 'Message history' }).getByRole('article').filter({
    hasText: content,
  });
}
