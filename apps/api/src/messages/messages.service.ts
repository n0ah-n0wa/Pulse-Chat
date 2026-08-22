import { HttpStatus, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';

import {
  API_ERROR_CODES,
  ATTACHMENT_ERROR_CODES,
  MESSAGE_ERROR_CODES,
  MESSAGE_PAGE_SIZE_DEFAULT,
  ROOM_ERROR_CODES,
  ROOM_TYPES,
  type AddReactionInput,
  type CreateMessageInput,
  type CreateMessageResult,
  type ListMessagesQuery,
  type MessageListResponse,
  type MessageResponse,
  type MessageSearchListResponse,
  type SearchMessagesQuery,
  type UpdateMessageInput,
} from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RoomsService } from '../rooms/rooms.service.js';
import type { UserRepository } from '../users/user.repository.interface.js';
import { USER_REPOSITORY } from '../users/users.tokens.js';
import { MentionResolverService } from './mention-resolver.service.js';
import { canDeleteMessage, canEditMessage } from './message-permissions.js';
import {
  toMessageListResponse,
  toMessageResponse,
  toMessageSearchListResponse,
} from './message.mapper.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import type {
  MessageReactionRepository,
  MessageRecord,
  MessageReplyReferenceRecord,
  MessageRepository,
} from './message.repository.interface.js';
import { MESSAGE_REACTION_REPOSITORY, MESSAGE_REPOSITORY } from './messages.tokens.js';
import { sanitizeTextSearchQuery } from './utils/sanitize-text-search-query.js';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @Inject(MESSAGE_REPOSITORY) private readonly messages: MessageRepository,
    @Inject(MESSAGE_REACTION_REPOSITORY) private readonly reactions: MessageReactionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly roomsService: RoomsService,
    private readonly notificationsService: NotificationsService,
    private readonly mentionResolver: MentionResolverService,
    @Inject(forwardRef(() => AttachmentsService))
    private readonly attachmentsService: AttachmentsService,
  ) {}

  async listMessages(
    userId: string,
    roomId: string,
    query: ListMessagesQuery,
  ): Promise<MessageListResponse> {
    await this.roomsService.requireMember(userId, roomId);

    const limit = query.limit ?? MESSAGE_PAGE_SIZE_DEFAULT;
    const before = await this.resolveCursor(roomId, query.before);
    const records = await this.messages.findPage({
      roomId,
      limit: limit + 1,
      before,
    });

    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const reactionMap = await this.reactions.summarizeByMessageIds(
      page.map((message) => message.id),
      userId,
    );
    const replyMap = await this.loadReplyMap(page);
    const attachmentMap = await this.attachmentsService.hydrateAttachmentMap(page);

    return toMessageListResponse(page, hasMore, reactionMap, replyMap, attachmentMap);
  }

  async searchMessages(
    userId: string,
    roomId: string,
    query: SearchMessagesQuery,
  ): Promise<MessageSearchListResponse> {
    await this.roomsService.requireMember(userId, roomId);

    const limit = query.limit ?? MESSAGE_PAGE_SIZE_DEFAULT;
    const searchText = sanitizeTextSearchQuery(query.q);
    if (searchText.length === 0) {
      throw new ApiException(
        API_ERROR_CODES.VALIDATION_FAILED,
        'Search query cannot be empty.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const before = await this.resolveCursor(roomId, query.before);
    const records = await this.messages.searchPage({
      roomId,
      searchText,
      limit: limit + 1,
      before,
    });

    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const authorIds = [...new Set(page.map((message) => message.authorId))];
    const authors = await this.users.findByIds(authorIds);
    const authorMap = new Map(authors.map((author) => [author.id, author]));

    return toMessageSearchListResponse(page, hasMore, authorMap, query.q);
  }

  async createMessage(
    userId: string,
    roomId: string,
    input: CreateMessageInput,
  ): Promise<CreateMessageResult> {
    await this.roomsService.requireMember(userId, roomId);

    const existing = await this.messages.findByClientMessageId(
      roomId,
      userId,
      input.clientMessageId,
    );
    if (existing != null) {
      return {
        message: await this.toHydratedMessageResponse(existing, userId),
        created: false,
      };
    }

    const room = await this.roomsService.getRoomRecord(roomId);
    const replyToMessage = await this.resolveReplyTarget(roomId, input.replyToMessageId);
    const attachmentRecords = await this.attachmentsService.resolveAttachmentsForMessage(
      userId,
      roomId,
      input.attachmentIds,
    );

    try {
      const created = await this.messages.create({
        roomId,
        authorId: userId,
        content: input.content,
        clientMessageId: input.clientMessageId,
        replyToMessageId: replyToMessage?.id,
        attachmentIds: attachmentRecords.map((attachment) => attachment.id),
      });

      const linked = await this.attachmentsService.linkAttachmentsToMessage(
        attachmentRecords.map((attachment) => attachment.id),
        created.id,
      );
      if (!linked) {
        await this.messages.softDelete(created.id, new Date());
        throw new ApiException(
          ATTACHMENT_ERROR_CODES.ATTACHMENT_ALREADY_LINKED,
          'Attachment is already linked to a message.',
          HttpStatus.CONFLICT,
        );
      }

      // Fire-and-forget notifications (failures should not block the response).
      void this.dispatchNotifications(userId, created, replyToMessage, room.type);

      return {
        message: await this.toHydratedMessageResponse(created, userId),
        created: true,
      };
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        const raced = await this.messages.findByClientMessageId(
          roomId,
          userId,
          input.clientMessageId,
        );
        if (raced != null) {
          return {
            message: await this.toHydratedMessageResponse(raced, userId),
            created: false,
          };
        }
      }
      throw error;
    }
  }

  async updateMessage(
    userId: string,
    messageId: string,
    input: UpdateMessageInput,
  ): Promise<MessageResponse> {
    const message = await this.requireMessage(messageId);
    const membership = await this.roomsService.requireMember(userId, message.roomId);
    this.rejectIfDeleted(message);

    if (!canEditMessage(userId, message.authorId, membership)) {
      this.throwInsufficientRole();
    }

    const updated = await this.messages.updateContent(message.id, input.content, new Date());
    if (updated === null) {
      this.throwAlreadyDeleted();
    }

    return this.toHydratedMessageResponse(updated, userId);
  }

  async deleteMessage(userId: string, messageId: string): Promise<MessageResponse> {
    const message = await this.requireMessage(messageId);
    const membership = await this.roomsService.requireMember(userId, message.roomId);
    this.rejectIfDeleted(message);

    if (!canDeleteMessage(userId, message.authorId, membership)) {
      this.throwInsufficientRole();
    }

    const deleted = await this.messages.softDelete(message.id, new Date());
    if (deleted === null) {
      this.throwAlreadyDeleted();
    }

    return this.toHydratedMessageResponse(deleted, userId);
  }

  async toggleReaction(
    userId: string,
    messageId: string,
    input: AddReactionInput,
  ): Promise<MessageResponse> {
    const message = await this.requireMessage(messageId);
    await this.roomsService.requireMember(userId, message.roomId);
    this.rejectIfDeleted(message);

    const emoji = input.emoji.trim();

    const existing = await this.reactions.findByMessageUserAndEmoji(message.id, userId, emoji);
    if (existing === null) {
      try {
        await this.reactions.create({ messageId: message.id, userId, emoji });
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) {
          throw error;
        }
      }
    } else {
      await this.reactions.deleteByMessageUserAndEmoji(message.id, userId, emoji);
    }

    return this.toHydratedMessageResponse(message, userId);
  }

  async removeReaction(userId: string, messageId: string, emoji: string): Promise<MessageResponse> {
    const message = await this.requireMessage(messageId);
    await this.roomsService.requireMember(userId, message.roomId);
    this.rejectIfDeleted(message);

    await this.reactions.deleteByMessageUserAndEmoji(message.id, userId, emoji.trim());

    return this.toHydratedMessageResponse(message, userId);
  }

  private async requireMessage(messageId: string): Promise<MessageRecord> {
    const message = await this.messages.findById(messageId);
    if (message === null) {
      throw new ApiException(
        MESSAGE_ERROR_CODES.MESSAGE_NOT_FOUND,
        'Message not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return message;
  }

  private async toHydratedMessageResponse(
    message: MessageRecord,
    currentUserId: string,
  ): Promise<MessageResponse> {
    const reactionMap = await this.reactions.summarizeByMessageIds([message.id], currentUserId);
    const replyMap = await this.loadReplyMap([message]);
    const attachments = await this.attachmentsService.hydrateAttachmentResponses(
      message.attachments,
    );

    return toMessageResponse(message, {
      reactions: reactionMap.get(message.id),
      replyTo:
        message.replyToMessageId === undefined ? undefined : replyMap.get(message.replyToMessageId),
      attachments,
    });
  }

  private async loadReplyMap(
    messages: readonly MessageRecord[],
  ): Promise<Map<string, MessageReplyReferenceRecord>> {
    const replyIds = [
      ...new Set(
        messages.flatMap((message) =>
          message.replyToMessageId === undefined ? [] : [message.replyToMessageId],
        ),
      ),
    ];
    const replyMessages = await this.messages.findByIds(replyIds);

    return new Map<string, MessageReplyReferenceRecord>(
      replyMessages.map((reply) => [
        reply.id,
        {
          id: reply.id,
          authorId: reply.authorId,
          content: reply.content,
          createdAt: reply.createdAt,
          deletedAt: reply.deletedAt,
        },
      ]),
    );
  }

  private async resolveReplyTarget(
    roomId: string,
    replyToMessageId: string | undefined,
  ): Promise<MessageRecord | undefined> {
    if (replyToMessageId === undefined) {
      return undefined;
    }

    const replyMessage = await this.messages.findById(replyToMessageId);
    if (replyMessage?.roomId !== roomId) {
      throw new ApiException(
        MESSAGE_ERROR_CODES.INVALID_REPLY_REFERENCE,
        'Reply target must reference a message in the same room.',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.rejectIfDeleted(replyMessage);

    return replyMessage;
  }

  private rejectIfDeleted(message: MessageRecord): void {
    if (message.deletedAt !== undefined) {
      this.throwAlreadyDeleted();
    }
  }

  private throwAlreadyDeleted(): never {
    throw new ApiException(
      MESSAGE_ERROR_CODES.MESSAGE_ALREADY_DELETED,
      'This message has already been deleted.',
      HttpStatus.CONFLICT,
    );
  }

  private throwInsufficientRole(): never {
    throw new ApiException(
      ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE,
      'You do not have permission to perform this action.',
      HttpStatus.FORBIDDEN,
    );
  }

  private async resolveCursor(
    roomId: string,
    before: string | undefined,
  ): Promise<{ createdAt: Date; id: string } | undefined> {
    if (before === undefined) {
      return undefined;
    }

    const cursorMessage = await this.messages.findById(before);
    if (cursorMessage?.roomId !== roomId) {
      throw new ApiException(
        MESSAGE_ERROR_CODES.INVALID_MESSAGE_CURSOR,
        'Message cursor is invalid for this room.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return { createdAt: cursorMessage.createdAt, id: cursorMessage.id };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }

  /**
   * Dispatches mention, reply, and DM notifications for a newly created
   * message. Errors are silently swallowed so they never block message
   * delivery.
   */
  private async dispatchNotifications(
    authorId: string,
    message: MessageRecord,
    replyTarget: MessageRecord | undefined,
    roomType: string,
  ): Promise<void> {
    try {
      // Mention notifications for @username tokens resolved through the user store.
      const mentionedIds = await this.mentionResolver.resolveMentionedUserIds(message.content);
      const memberIds = new Set(await this.roomsService.listMemberUserIds(message.roomId));
      await Promise.all(
        mentionedIds
          .filter((recipientId) => memberIds.has(recipientId))
          .map((recipientId) =>
            this.notificationsService.notifyMention(authorId, recipientId, message.id),
          ),
      );

      if (replyTarget !== undefined && memberIds.has(replyTarget.authorId)) {
        await this.notificationsService.notifyReply(authorId, replyTarget.authorId, message.id);
      }

      // Direct-message notification to the other party.
      if (roomType === ROOM_TYPES.DIRECT) {
        const peerId = await this.roomsService.getDirectRoomPeer(message.roomId, authorId);
        if (peerId !== undefined) {
          await this.notificationsService.notifyDirectMessage(authorId, peerId, message.id);
        }
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to dispatch message notifications: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
