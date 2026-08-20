import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NOTIFICATION_ERROR_CODES, NOTIFICATION_TYPES } from '@pulse-chat/shared';

import type { RealtimeMessageBroadcastService } from '../realtime/realtime-message-broadcast.service.js';
import type { NotificationRecord, NotificationRepository } from './notification.repository.interface.js';
import { NotificationsService } from './notifications.service.js';

const USER_ID = '507f1f77bcf86cd799439011';
const ACTOR_ID = '507f1f77bcf86cd799439012';
const REF_ID = '507f1f77bcf86cd799439021';
const NOTIF_ID = '507f1f77bcf86cd799439031';

function notifRecord(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: NOTIF_ID,
    userId: USER_ID,
    type: NOTIFICATION_TYPES.MENTION,
    referenceId: REF_ID,
    actorId: ACTOR_ID,
    isRead: false,
    createdAt: new Date('2026-08-19T10:00:00.000Z'),
    updatedAt: new Date('2026-08-19T10:00:00.000Z'),
    ...overrides,
  };
}

describe('NotificationsService', () => {
  const findOrCreate = vi.fn<NotificationRepository['findOrCreate']>();
  const findPage = vi.fn<NotificationRepository['findPage']>();
  const findById = vi.fn<NotificationRepository['findById']>();
  const markRead = vi.fn<NotificationRepository['markRead']>();
  const markAllRead = vi.fn<NotificationRepository['markAllRead']>();
  const broadcastNotification = vi.fn<RealtimeMessageBroadcastService['broadcastNotification']>();

  const repository: NotificationRepository = {
    findOrCreate,
    findPage,
    findById,
    markRead,
    markAllRead,
  };

  const broadcast = { broadcastNotification } as unknown as RealtimeMessageBroadcastService;
  const service = new NotificationsService(repository, broadcast);

  beforeEach(() => {
    vi.resetAllMocks();
    broadcastNotification.mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // notify
  // ---------------------------------------------------------------------------

  it('creates a notification and broadcasts it when a new record is created', async () => {
    const record = notifRecord();
    findOrCreate.mockResolvedValue({ record, created: true });

    await service.notify({
      userId: USER_ID,
      type: NOTIFICATION_TYPES.MENTION,
      referenceId: REF_ID,
      actorId: ACTOR_ID,
    });

    expect(findOrCreate).toHaveBeenCalledOnce();
    expect(broadcastNotification).toHaveBeenCalledOnce();
    expect(broadcastNotification).toHaveBeenCalledWith({
      notification: expect.objectContaining({ id: NOTIF_ID, userId: USER_ID }) as unknown,
    });
  });

  it('does not broadcast when the notification already existed', async () => {
    const record = notifRecord();
    findOrCreate.mockResolvedValue({ record, created: false });

    await service.notify({
      userId: USER_ID,
      type: NOTIFICATION_TYPES.MENTION,
      referenceId: REF_ID,
      actorId: ACTOR_ID,
    });

    expect(broadcastNotification).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // listNotifications
  // ---------------------------------------------------------------------------

  it('returns a paginated list for the requesting user', async () => {
    const records = [notifRecord(), notifRecord({ id: '507f1f77bcf86cd799439032' })];
    findPage.mockResolvedValue(records);

    const result = await service.listNotifications(USER_ID, { limit: 20 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeUndefined();
    expect(findPage).toHaveBeenCalledWith({ userId: USER_ID, limit: 21, before: undefined });
  });

  it('returns nextCursor when there are more records', async () => {
    // 3 records returned for limit=2 → hasMore
    const records = Array.from({ length: 3 }, (_, i) =>
      notifRecord({ id: `507f1f77bcf86cd79943903${String(i)}` }),
    );
    findPage.mockResolvedValue(records);

    const result = await service.listNotifications(USER_ID, { limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe('507f1f77bcf86cd799439031');
  });

  it('rejects an invalid cursor (wrong owner)', async () => {
    findById.mockResolvedValue(notifRecord({ userId: ACTOR_ID }));

    await expect(
      service.listNotifications(USER_ID, { before: NOTIF_ID }),
    ).rejects.toMatchObject({ code: NOTIFICATION_ERROR_CODES.NOTIFICATION_NOT_FOUND });
  });

  it('rejects a non-existent cursor', async () => {
    findById.mockResolvedValue(null);

    await expect(
      service.listNotifications(USER_ID, { before: NOTIF_ID }),
    ).rejects.toMatchObject({ code: NOTIFICATION_ERROR_CODES.NOTIFICATION_NOT_FOUND });
  });

  // ---------------------------------------------------------------------------
  // markRead
  // ---------------------------------------------------------------------------

  it('marks a notification as read and returns the updated record', async () => {
    markRead.mockResolvedValue(notifRecord({ isRead: true }));

    const result = await service.markRead(NOTIF_ID, USER_ID);

    expect(result.isRead).toBe(true);
    expect(markRead).toHaveBeenCalledWith(NOTIF_ID, USER_ID);
  });

  it('throws not-found when the notification does not belong to the user', async () => {
    markRead.mockResolvedValue(null);

    await expect(service.markRead(NOTIF_ID, USER_ID)).rejects.toMatchObject({
      code: NOTIFICATION_ERROR_CODES.NOTIFICATION_NOT_FOUND,
    });
  });

  it('throws not-found for an invalid ObjectId', async () => {
    await expect(service.markRead('bad-id', USER_ID)).rejects.toMatchObject({
      code: NOTIFICATION_ERROR_CODES.NOTIFICATION_NOT_FOUND,
    });
  });

  // ---------------------------------------------------------------------------
  // markAllRead
  // ---------------------------------------------------------------------------

  it('calls markAllRead on the repository', async () => {
    markAllRead.mockResolvedValue(undefined);

    await service.markAllRead(USER_ID);

    expect(markAllRead).toHaveBeenCalledWith(USER_ID);
  });

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  it('does not notify when actor and recipient are the same', async () => {
    await service.notifyMention(USER_ID, USER_ID, REF_ID);
    expect(findOrCreate).not.toHaveBeenCalled();
  });

  it('does not send a reply notification when replying to oneself', async () => {
    await service.notifyReply(USER_ID, USER_ID, REF_ID);
    expect(findOrCreate).not.toHaveBeenCalled();
  });
});
