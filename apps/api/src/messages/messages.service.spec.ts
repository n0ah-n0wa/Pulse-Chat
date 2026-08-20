import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MEMBERSHIP_ROLES, MESSAGE_ERROR_CODES, ROOM_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import type { AttachmentsService } from '../attachments/attachments.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { RoomMemberRecord } from '../rooms/room-member.repository.interface.js';
import type { RoomsService } from '../rooms/rooms.service.js';
import type { UserRepository } from '../users/user.repository.interface.js';
import type { MentionResolverService } from './mention-resolver.service.js';
import type {
  MessageReactionRepository,
  MessageRecord,
  MessageRepository,
} from './message.repository.interface.js';
import { MessagesService } from './messages.service.js';

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';
const ROOM_ID = '507f1f77bcf86cd799439021';
const OTHER_ROOM_ID = '507f1f77bcf86cd799439022';
const MESSAGE_ID = '507f1f77bcf86cd799439041';

function message(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: MESSAGE_ID,
    roomId: ROOM_ID,
    authorId: USER_ID,
    content: 'Hello',
    clientMessageId: 'client-1',
    attachments: [],
    createdAt: new Date('2026-08-18T00:00:00.000Z'),
    updatedAt: new Date('2026-08-18T00:00:00.000Z'),
    ...overrides,
  };
}

function membership(overrides: Partial<RoomMemberRecord> = {}): RoomMemberRecord {
  return {
    id: '507f1f77bcf86cd799439031',
    roomId: ROOM_ID,
    userId: USER_ID,
    role: MEMBERSHIP_ROLES.MEMBER,
    joinedAt: new Date('2026-08-18T00:00:00.000Z'),
    ...overrides,
  };
}

describe('MessagesService', () => {
  const create = vi.fn<MessageRepository['create']>();
  const findById = vi.fn<MessageRepository['findById']>();
  const findByClientMessageId = vi.fn<MessageRepository['findByClientMessageId']>();
  const findPage = vi.fn<MessageRepository['findPage']>();
  const searchPage = vi.fn<MessageRepository['searchPage']>();
  const findByIds = vi.fn<MessageRepository['findByIds']>();
  const updateContent = vi.fn<MessageRepository['updateContent']>();
  const softDelete = vi.fn<MessageRepository['softDelete']>();
  const removeAttachmentReference = vi.fn<MessageRepository['removeAttachmentReference']>();
  const createReaction = vi.fn<MessageReactionRepository['create']>();
  const deleteReaction = vi.fn<MessageReactionRepository['deleteByMessageUserAndEmoji']>();
  const findReaction = vi.fn<MessageReactionRepository['findByMessageUserAndEmoji']>();
  const summarizeReactions = vi.fn<MessageReactionRepository['summarizeByMessageIds']>();
  const requireMember = vi.fn<RoomsService['requireMember']>();

  const repository: MessageRepository = {
    create,
    findById,
    findByClientMessageId,
    findByIds,
    findPage,
    searchPage,
    updateContent,
    softDelete,
    removeAttachmentReference,
  };

  const reactions: MessageReactionRepository = {
    create: createReaction,
    deleteByMessageUserAndEmoji: deleteReaction,
    findByMessageUserAndEmoji: findReaction,
    summarizeByMessageIds: summarizeReactions,
  };

  const getRoomRecord = vi.fn<RoomsService['getRoomRecord']>();
  const getDirectRoomPeer = vi.fn<RoomsService['getDirectRoomPeer']>();
  const notifyMention = vi.fn().mockResolvedValue(undefined);
  const notifyReply = vi.fn().mockResolvedValue(undefined);
  const notifyDirectMessage = vi.fn().mockResolvedValue(undefined);
  const resolveMentionedUserIds = vi.fn<MentionResolverService['resolveMentionedUserIds']>();
  const findUsersByIds = vi.fn<UserRepository['findByIds']>();
  const resolveAttachmentsForMessage = vi.fn<AttachmentsService['resolveAttachmentsForMessage']>();
  const linkAttachmentsToMessage = vi.fn<AttachmentsService['linkAttachmentsToMessage']>();
  const hydrateAttachmentResponses = vi.fn<AttachmentsService['hydrateAttachmentResponses']>();

  const roomsService = {
    requireMember,
    getRoomRecord,
    getDirectRoomPeer,
  } as unknown as RoomsService;
  const notificationsService = {
    notifyMention,
    notifyReply,
    notifyDirectMessage,
  } as unknown as NotificationsService;
  const mentionResolver = { resolveMentionedUserIds } as unknown as MentionResolverService;
  const users = { findByIds: findUsersByIds } as unknown as UserRepository;
  const attachmentsService = {
    resolveAttachmentsForMessage,
    linkAttachmentsToMessage,
    hydrateAttachmentResponses,
  } as unknown as AttachmentsService;
  const service = new MessagesService(
    repository,
    reactions,
    users,
    roomsService,
    notificationsService,
    mentionResolver,
    attachmentsService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    requireMember.mockResolvedValue(membership());
    getRoomRecord.mockResolvedValue({
      id: ROOM_ID,
      type: 'public',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as import('../rooms/room.repository.interface.js').RoomRecord);
    getDirectRoomPeer.mockResolvedValue(undefined);
    notifyMention.mockResolvedValue(undefined);
    notifyReply.mockResolvedValue(undefined);
    notifyDirectMessage.mockResolvedValue(undefined);
    resolveMentionedUserIds.mockResolvedValue([]);
    findByClientMessageId.mockResolvedValue(null);
    summarizeReactions.mockResolvedValue(new Map());
    findByIds.mockResolvedValue([]);
    hydrateAttachmentResponses.mockResolvedValue([]);
    resolveAttachmentsForMessage.mockResolvedValue([]);
    linkAttachmentsToMessage.mockResolvedValue(undefined);
    deleteReaction.mockResolvedValue(false);
  });

  it('refuses to list messages when the caller is not a room member', async () => {
    requireMember.mockRejectedValue(
      new ApiException(ROOM_ERROR_CODES.NOT_A_MEMBER, 'You are not a member of this room.', 403),
    );

    await expect(service.listMessages(USER_ID, ROOM_ID, {})).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.NOT_A_MEMBER,
    });
    expect(findPage).not.toHaveBeenCalled();
  });

  it('refuses to create a message when the caller is not a room member', async () => {
    requireMember.mockRejectedValue(
      new ApiException(ROOM_ERROR_CODES.NOT_A_MEMBER, 'You are not a member of this room.', 403),
    );

    await expect(
      service.createMessage(USER_ID, ROOM_ID, { content: 'Hello', clientMessageId: 'client-1' }),
    ).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.NOT_A_MEMBER,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('returns an existing message for a repeated clientMessageId instead of inserting again', async () => {
    const existing = message();
    findByClientMessageId.mockResolvedValue(existing);

    const result = await service.createMessage(USER_ID, ROOM_ID, {
      content: 'Hello again',
      clientMessageId: 'client-1',
    });

    expect(result.created).toBe(false);
    expect(result.message.id).toBe(existing.id);
    expect(result.message.content).toBe('Hello');
    expect(create).not.toHaveBeenCalled();
  });

  it('treats a duplicate-key race as idempotent', async () => {
    findByClientMessageId.mockResolvedValueOnce(null).mockResolvedValueOnce(message());
    create.mockRejectedValue({ code: 11000 });

    const result = await service.createMessage(USER_ID, ROOM_ID, {
      content: 'Hello',
      clientMessageId: 'client-1',
    });

    expect(result.created).toBe(false);
    expect(result.message.id).toBe(MESSAGE_ID);
  });

  it('creates a message when the client id is new', async () => {
    findByClientMessageId.mockResolvedValue(null);
    create.mockResolvedValue(message({ content: 'First post' }));

    const result = await service.createMessage(USER_ID, ROOM_ID, {
      content: 'First post',
      clientMessageId: 'client-new',
    });

    expect(create).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      authorId: USER_ID,
      content: 'First post',
      clientMessageId: 'client-new',
      replyToMessageId: undefined,
      attachmentIds: [],
    });
    expect(result.created).toBe(true);
    expect(result.message.content).toBe('First post');
  });

  it('pages newest-first without loading the extra look-ahead row', async () => {
    const newest = message({ id: '507f1f77bcf86cd799439051', content: '3' });
    const middle = message({ id: '507f1f77bcf86cd799439050', content: '2' });
    const oldest = message({ id: '507f1f77bcf86cd799439049', content: '1' });
    findPage.mockResolvedValue([newest, middle, oldest]);

    const page = await service.listMessages(USER_ID, ROOM_ID, { limit: 2 });

    expect(findPage).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      limit: 3,
      before: undefined,
    });
    expect(page.items.map((item) => item.id)).toEqual([newest.id, middle.id]);
    expect(page.nextCursor).toBe(middle.id);
  });

  it('resolves a before cursor to createdAt and id', async () => {
    const cursor = message({
      id: '507f1f77bcf86cd799439050',
      createdAt: new Date('2026-08-18T00:01:00.000Z'),
    });
    findById.mockResolvedValue(cursor);
    findPage.mockResolvedValue([]);

    await service.listMessages(USER_ID, ROOM_ID, { before: cursor.id });

    expect(findPage).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      limit: 51,
      before: { createdAt: cursor.createdAt, id: cursor.id },
    });
  });

  it('rejects a cursor that belongs to another room', async () => {
    findById.mockResolvedValue(message({ roomId: OTHER_ROOM_ID }));

    await expect(
      service.listMessages(USER_ID, ROOM_ID, { before: MESSAGE_ID }),
    ).rejects.toMatchObject({
      code: MESSAGE_ERROR_CODES.INVALID_MESSAGE_CURSOR,
    });
    expect(findPage).not.toHaveBeenCalled();
  });

  it("does not reuse another author's clientMessageId", async () => {
    findByClientMessageId.mockResolvedValue(null);
    create.mockResolvedValue(message({ authorId: OTHER_USER_ID, clientMessageId: 'shared-id' }));

    await service.createMessage(OTHER_USER_ID, ROOM_ID, {
      content: 'Mine',
      clientMessageId: 'shared-id',
    });

    expect(findByClientMessageId).toHaveBeenCalledWith(ROOM_ID, OTHER_USER_ID, 'shared-id');
    expect(create).toHaveBeenCalled();
  });

  it('validates a same-room reply target during creation', async () => {
    const replyTarget = message({ id: '507f1f77bcf86cd799439099' });
    findById.mockResolvedValue(replyTarget);
    create.mockResolvedValue(message({ replyToMessageId: replyTarget.id }));

    const created = await service.createMessage(USER_ID, ROOM_ID, {
      content: 'Reply',
      clientMessageId: 'reply-1',
      replyToMessageId: replyTarget.id,
    });

    expect(create).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      authorId: USER_ID,
      content: 'Reply',
      clientMessageId: 'reply-1',
      replyToMessageId: replyTarget.id,
      attachmentIds: [],
    });
    expect(created.message.replyToMessageId).toBe(replyTarget.id);
  });

  it('returns the existing message before validating a mismatched reply on an idempotent retry', async () => {
    findByClientMessageId.mockResolvedValue(message({ id: '507f1f77bcf86cd799439055' }));

    const result = await service.createMessage(USER_ID, ROOM_ID, {
      content: 'Changed',
      clientMessageId: 'client-1',
      replyToMessageId: '507f1f77bcf86cd799439099',
    });

    expect(result.message.id).toBe('507f1f77bcf86cd799439055');
    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects a reply target from another room', async () => {
    findById.mockResolvedValue(message({ roomId: OTHER_ROOM_ID }));

    await expect(
      service.createMessage(USER_ID, ROOM_ID, {
        content: 'Reply',
        clientMessageId: 'reply-2',
        replyToMessageId: MESSAGE_ID,
      }),
    ).rejects.toMatchObject({
      code: MESSAGE_ERROR_CODES.INVALID_REPLY_REFERENCE,
    });
  });

  it('lets the author edit their message and sets editedAt', async () => {
    const existing = message();
    const editedAt = new Date('2026-08-18T02:00:00.000Z');
    findById.mockResolvedValue(existing);
    updateContent.mockResolvedValue(message({ content: 'Updated', editedAt, updatedAt: editedAt }));

    const result = await service.updateMessage(USER_ID, MESSAGE_ID, { content: 'Updated' });

    expect(updateContent).toHaveBeenCalledWith(MESSAGE_ID, 'Updated', expect.any(Date));
    expect(result.content).toBe('Updated');
    expect(result.editedAt).toBe(editedAt.toISOString());
  });

  it("lets a moderator edit another member's message", async () => {
    findById.mockResolvedValue(message({ authorId: USER_ID }));
    requireMember.mockResolvedValue(
      membership({ userId: OTHER_USER_ID, role: MEMBERSHIP_ROLES.MODERATOR }),
    );
    updateContent.mockResolvedValue(message({ content: 'Moderated', authorId: USER_ID }));

    await service.updateMessage(OTHER_USER_ID, MESSAGE_ID, { content: 'Moderated' });

    expect(updateContent).toHaveBeenCalled();
  });

  it("forbids a member from editing someone else's message", async () => {
    findById.mockResolvedValue(message({ authorId: USER_ID }));
    requireMember.mockResolvedValue(
      membership({ userId: OTHER_USER_ID, role: MEMBERSHIP_ROLES.MEMBER }),
    );

    await expect(
      service.updateMessage(OTHER_USER_ID, MESSAGE_ID, { content: 'Nope' }),
    ).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE,
    });
    expect(updateContent).not.toHaveBeenCalled();
  });

  it('rejects editing a deleted message', async () => {
    findById.mockResolvedValue(message({ deletedAt: new Date('2026-08-18T03:00:00.000Z') }));

    await expect(
      service.updateMessage(USER_ID, MESSAGE_ID, { content: 'Revive' }),
    ).rejects.toMatchObject({
      code: MESSAGE_ERROR_CODES.MESSAGE_ALREADY_DELETED,
    });
    expect(updateContent).not.toHaveBeenCalled();
  });

  it('lets the author soft-delete their message', async () => {
    findById.mockResolvedValue(message());
    softDelete.mockResolvedValue(message({ deletedAt: new Date('2026-08-18T03:00:00.000Z') }));

    const deleted = await service.deleteMessage(USER_ID, MESSAGE_ID);

    expect(deleted.deletedAt).toBeDefined();
    expect(deleted.content).toBe('');
    expect(softDelete).toHaveBeenCalledWith(MESSAGE_ID, expect.any(Date));
  });

  it("lets a moderator delete another member's message", async () => {
    findById.mockResolvedValue(message({ authorId: USER_ID }));
    requireMember.mockResolvedValue(
      membership({ userId: OTHER_USER_ID, role: MEMBERSHIP_ROLES.MODERATOR }),
    );
    softDelete.mockResolvedValue(message({ deletedAt: new Date() }));

    const deleted = await service.deleteMessage(OTHER_USER_ID, MESSAGE_ID);

    expect(deleted.id).toBe(MESSAGE_ID);
    expect(softDelete).toHaveBeenCalled();
  });

  it("forbids a member from deleting someone else's message", async () => {
    findById.mockResolvedValue(message({ authorId: USER_ID }));
    requireMember.mockResolvedValue(membership({ userId: OTHER_USER_ID }));

    await expect(service.deleteMessage(OTHER_USER_ID, MESSAGE_ID)).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE,
    });
    expect(softDelete).not.toHaveBeenCalled();
  });

  it('rejects deleting a message that is already deleted', async () => {
    findById.mockResolvedValue(message({ deletedAt: new Date('2026-08-18T03:00:00.000Z') }));

    await expect(service.deleteMessage(USER_ID, MESSAGE_ID)).rejects.toMatchObject({
      code: MESSAGE_ERROR_CODES.MESSAGE_ALREADY_DELETED,
    });
    expect(softDelete).not.toHaveBeenCalled();
  });

  it('returns not found for an unknown message', async () => {
    findById.mockResolvedValue(null);

    await expect(
      service.updateMessage(USER_ID, MESSAGE_ID, { content: 'Gone' }),
    ).rejects.toMatchObject({
      code: MESSAGE_ERROR_CODES.MESSAGE_NOT_FOUND,
    });
  });

  it('toggles a reaction on and off for the same user and emoji', async () => {
    findById.mockResolvedValue(message());
    findReaction.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: '507f1f77bcf86cd799439201',
      messageId: MESSAGE_ID,
      userId: USER_ID,
      emoji: '👍',
      createdAt: new Date(),
    });
    createReaction.mockResolvedValue({
      id: '507f1f77bcf86cd799439201',
      messageId: MESSAGE_ID,
      userId: USER_ID,
      emoji: '👍',
      createdAt: new Date(),
    });
    summarizeReactions
      .mockResolvedValueOnce(
        new Map([[MESSAGE_ID, [{ emoji: '👍', count: 1, reactedByCurrentUser: true }]]]),
      )
      .mockResolvedValueOnce(new Map());

    const added = await service.toggleReaction(USER_ID, MESSAGE_ID, { emoji: '👍' });
    const removed = await service.toggleReaction(USER_ID, MESSAGE_ID, { emoji: '👍' });

    expect(createReaction).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      userId: USER_ID,
      emoji: '👍',
    });
    expect(deleteReaction).toHaveBeenCalledWith(MESSAGE_ID, USER_ID, '👍');
    expect(added.reactions).toEqual([{ emoji: '👍', count: 1, reactedByCurrentUser: true }]);
    expect(removed.reactions).toEqual([]);
  });

  it('treats a duplicate-key race during reaction add as success instead of failing', async () => {
    findById.mockResolvedValue(message());
    findReaction.mockResolvedValue(null);
    createReaction.mockRejectedValue({ code: 11000 });
    summarizeReactions.mockResolvedValue(
      new Map([[MESSAGE_ID, [{ emoji: '👍', count: 1, reactedByCurrentUser: true }]]]),
    );

    const response = await service.toggleReaction(USER_ID, MESSAGE_ID, { emoji: '👍' });

    expect(response.reactions).toEqual([{ emoji: '👍', count: 1, reactedByCurrentUser: true }]);
  });

  it('removes a reaction explicitly through delete', async () => {
    findById.mockResolvedValue(message());
    summarizeReactions.mockResolvedValue(new Map());

    const response = await service.removeReaction(USER_ID, MESSAGE_ID, '👍');

    expect(deleteReaction).toHaveBeenCalledWith(MESSAGE_ID, USER_ID, '👍');
    expect(response.reactions).toEqual([]);
  });

  it('forbids reacting to a deleted message', async () => {
    findById.mockResolvedValue(message({ deletedAt: new Date('2026-08-18T03:00:00.000Z') }));

    await expect(
      service.toggleReaction(USER_ID, MESSAGE_ID, { emoji: '👍' }),
    ).rejects.toMatchObject({
      code: MESSAGE_ERROR_CODES.MESSAGE_ALREADY_DELETED,
    });
  });
});
