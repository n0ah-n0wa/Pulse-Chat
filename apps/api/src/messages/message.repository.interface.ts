import type { AttachmentReference } from '@pulse-chat/shared';

/** Domain representation of a persisted chat message. */
export interface MessageRecord {
  readonly id: string;
  readonly roomId: string;
  readonly authorId: string;
  readonly content: string;
  readonly clientMessageId: string;
  readonly replyToMessageId?: string;
  readonly attachments: readonly AttachmentReference[];
  readonly editedAt?: Date;
  readonly deletedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MessageReplyReferenceRecord {
  readonly id: string;
  readonly authorId: string;
  readonly content: string;
  readonly createdAt: Date;
  readonly deletedAt?: Date;
}

export interface MessageReactionSummaryRecord {
  readonly emoji: string;
  readonly count: number;
  readonly reactedByCurrentUser: boolean;
}

export interface CreateMessageRecordInput {
  readonly roomId: string;
  readonly authorId: string;
  readonly content: string;
  readonly clientMessageId: string;
  readonly replyToMessageId?: string;
  readonly attachmentIds?: readonly string[];
}

export interface MessagePageQuery {
  readonly roomId: string;
  readonly limit: number;
  readonly before?: {
    readonly createdAt: Date;
    readonly id: string;
  };
}

export interface MessageSearchPageQuery {
  readonly roomId: string;
  readonly searchText: string;
  readonly limit: number;
  readonly before?: {
    readonly createdAt: Date;
    readonly id: string;
  };
}

/** Data-access contract for chat messages. */
export interface MessageRepository {
  create(input: CreateMessageRecordInput): Promise<MessageRecord>;
  findById(id: string): Promise<MessageRecord | null>;
  findByClientMessageId(
    roomId: string,
    authorId: string,
    clientMessageId: string,
  ): Promise<MessageRecord | null>;
  findByIds(ids: readonly string[]): Promise<MessageRecord[]>;
  findPage(query: MessagePageQuery): Promise<MessageRecord[]>;
  searchPage(query: MessageSearchPageQuery): Promise<MessageRecord[]>;
  updateContent(id: string, content: string, editedAt: Date): Promise<MessageRecord | null>;
  softDelete(id: string, deletedAt: Date): Promise<MessageRecord | null>;
  removeAttachmentReference(messageId: string, attachmentId: string): Promise<void>;
}

export interface CreateMessageReactionInput {
  readonly messageId: string;
  readonly userId: string;
  readonly emoji: string;
}

export interface MessageReactionRecord {
  readonly id: string;
  readonly messageId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly createdAt: Date;
}

export interface MessageReactionRepository {
  create(input: CreateMessageReactionInput): Promise<MessageReactionRecord>;
  deleteByMessageUserAndEmoji(messageId: string, userId: string, emoji: string): Promise<boolean>;
  findByMessageUserAndEmoji(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<MessageReactionRecord | null>;
  summarizeByMessageIds(
    messageIds: readonly string[],
    currentUserId: string,
  ): Promise<Map<string, MessageReactionSummaryRecord[]>>;
}
