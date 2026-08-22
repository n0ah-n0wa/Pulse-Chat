import { expect, test } from '@playwright/test';

import {
  createIsolatedUser,
  createRoom,
  loginUser,
  messageArticle,
  registerUser,
  sendMessage,
  uniqueId,
  waitUntilConnected,
} from './helpers.js';

test.describe.configure({ mode: 'serial' });

test('critical path: register, login, realtime chat, presence, typing, unread, notifications, logout', async ({
  browser,
}) => {
  const id = uniqueId();
  const userA = createIsolatedUser('a', id);
  const userB = createIsolatedUser('b', id);
  const publicRoom = `E2E Public ${id}`;
  const original = `alpha ${id}`;
  const edited = `alpha edited ${id}`;
  const reply = `bravo reply ${id}`;
  const doomed = `gamma delete ${id}`;
  const unreadPing = `delta unread ${id}`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await registerUser(pageA, userA);
    await pageA.getByRole('button', { name: 'Sign out' }).click();
    await expect(pageA.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await loginUser(pageA, userA);

    await registerUser(pageB, userB);

    await createRoom(pageA, publicRoom, 'Public');

    await pageB.reload();
    await waitUntilConnected(pageB);
    await expect(pageB.getByRole('button', { name: `Join ${publicRoom}` })).toBeVisible();
    await pageB.getByRole('button', { name: `Join ${publicRoom}` }).click();
    await expect(pageB.getByRole('heading', { name: publicRoom })).toBeVisible();
    await waitUntilConnected(pageB);

    await pageA.reload();
    await expect(pageA.getByRole('heading', { name: publicRoom })).toBeVisible();
    await waitUntilConnected(pageA);

    const memberB = pageA.getByRole('list', { name: 'Room members' }).getByRole('listitem').filter({
      hasText: userB.displayName,
    });
    await expect(memberB).toBeVisible();
    await expect(memberB.getByText('Online')).toBeVisible();

    const composerA = pageA.getByRole('form', { name: 'Send a message' });
    await composerA.getByRole('textbox', { name: 'Message' }).fill('typing');
    await expect(pageB.getByRole('status')).toContainText(`${userA.displayName} is typing`);
    await composerA.getByRole('textbox', { name: 'Message' }).fill(original);
    await composerA.getByRole('button', { name: 'Send' }).click();

    await expect(messageArticle(pageB, original)).toBeVisible();

    await messageArticle(pageB, original).getByRole('button', { name: 'Reply' }).click();
    await sendMessage(pageB, reply);
    await expect(messageArticle(pageA, reply)).toBeVisible();
    await expect(messageArticle(pageA, reply)).toContainText(original);

    await messageArticle(pageA, reply).getByRole('button', { name: 'React with 👍' }).click();
    await expect(messageArticle(pageB, reply).getByRole('button', { name: '👍 1' })).toBeVisible();

    await messageArticle(pageA, original).getByRole('button', { name: 'Edit' }).click();
    await pageA.getByLabel('Edited message').fill(edited);
    await pageA.getByRole('button', { name: 'Save' }).click();
    await expect(messageArticle(pageB, edited)).toContainText('(edited)');

    await sendMessage(pageA, doomed);
    await expect(messageArticle(pageB, doomed)).toBeVisible();
    await messageArticle(pageA, doomed).getByRole('button', { name: 'Delete' }).click();
    await expect(pageB.getByRole('article', { name: 'Deleted message' })).toBeVisible();

    await pageB.getByRole('link', { name: 'Pulse Chat' }).click();
    await expect(pageB.getByRole('heading', { name: 'Select a room' })).toBeVisible();
    await sendMessage(pageA, unreadPing);
    await expect(pageB.getByLabel(/unread messages/)).toBeVisible();

    await pageA.getByRole('button', { name: 'Notifications' }).click();
    await expect(
      pageA.getByRole('dialog', { name: 'Notifications' }).getByText('Reply', { exact: true }),
    ).toBeVisible();
    await pageA
      .getByRole('dialog', { name: 'Notifications' })
      .getByRole('button', { name: 'Close' })
      .click();

    await pageA.getByRole('button', { name: 'Sign out' }).click();
    await expect(pageA.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('denies a non-member access to a private room', async ({ browser }) => {
  const id = uniqueId();
  const userA = createIsolatedUser('a', id);
  const userB = createIsolatedUser('b', id);
  const privateRoom = `E2E Private ${id}`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await registerUser(pageA, userA);
    await registerUser(pageB, userB);

    const roomId = await createRoom(pageA, privateRoom, 'Private');
    await pageB.goto(`/app/rooms/${roomId}`);
    await expect(pageB.getByRole('heading', { name: 'Room unavailable' })).toBeVisible();
    await expect(pageB.getByRole('button', { name: `Join ${privateRoom}` })).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
