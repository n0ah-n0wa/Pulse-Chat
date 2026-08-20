import type {
  AttachmentResponse,
  MessageListResponse,
  MessageReactionResponse,
  MessageReplyReferenceResponse,
  MessageResponse,
  MessageSearchListResponse,
} from '@pulse-chat/shared';

import { toPublicUserProfile } from '../users/user-profile.mapper.js';
import type { UserRecord } from '../users/user.repository.interface.js';
import type {
  MessageReactionSummaryRecord,
  MessageRecord,
  MessageReplyReferenceRecord,
} from './message.repository.interface.js';
import { buildSearchMatchingContext } from './utils/search-matching-context.js';

export interface MessageResponseOptions {
  readonly includeDeletedContent?: boolean;
  readonly reactions?: readonly MessageReactionSummaryRecord[];
  readonly replyTo?: MessageReplyReferenceRecord;
  readonly attachments?: readonly AttachmentResponse[];
}

function isDeleted(message: MessageRecord): boolean {
  return message.deletedAt !== undefined;
}

function toReactionResponse(reaction: MessageReactionSummaryRecord): MessageReactionResponse {
  return {
    emoji: reaction.emoji,
    count: reaction.count,
    reactedByCurrentUser: reaction.reactedByCurrentUser,
  };
}

function toReplyReferenceResponse(
  reply: MessageReplyReferenceRecord,
): MessageReplyReferenceResponse {
  return {
    id: reply.id,
    authorId: reply.authorId,
    content: reply.deletedAt === undefined ? reply.content : '',
    createdAt: reply.createdAt.toISOString(),
    ...(reply.deletedAt !== undefined ? { deletedAt: reply.deletedAt.toISOString() } : {}),
  };
}

/** Maps a persisted message to the public API shape. */
export function toMessageResponse(
  message: MessageRecord,
  options: MessageResponseOptions = {},
): MessageResponse {
  const hideContent = isDeleted(message) && options.includeDeletedContent !== true;

  return {
    id: message.id,
    roomId: message.roomId,
    authorId: message.authorId,
    content: hideContent ? '' : message.content,
    clientMessageId: message.clientMessageId,
    ...(message.replyToMessageId !== undefined
      ? { replyToMessageId: message.replyToMessageId }
      : {}),
    ...(options.replyTo !== undefined
      ? { replyTo: toReplyReferenceResponse(options.replyTo) }
      : {}),
    attachments: hideContent ? [] : [...(options.attachments ?? [])],
    reactions: (options.reactions ?? []).map(toReactionResponse),
    ...(message.editedAt !== undefined ? { editedAt: message.editedAt.toISOString() } : {}),
    ...(message.deletedAt !== undefined ? { deletedAt: message.deletedAt.toISOString() } : {}),
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
}

/** Maps a newest-first page of messages, attaching the next cursor when more exist. */
export function toMessageListResponse(
  page: readonly MessageRecord[],
  hasMore: boolean,
  reactionMap: ReadonlyMap<string, readonly MessageReactionSummaryRecord[]> = new Map(),
  replyMap: ReadonlyMap<string, MessageReplyReferenceRecord> = new Map(),
  attachmentMap: ReadonlyMap<string, readonly AttachmentResponse[]> = new Map(),
): MessageListResponse {
  const items = page.map((message) =>
    toMessageResponse(message, {
      reactions: reactionMap.get(message.id),
      replyTo:
        message.replyToMessageId === undefined ? undefined : replyMap.get(message.replyToMessageId),
      attachments: attachmentMap.get(message.id),
    }),
  );
  const oldest = items.at(-1);

  return {
    items,
    ...(hasMore && oldest !== undefined ? { nextCursor: oldest.id } : {}),
  };
}

/** Maps a newest-first search page with author profiles and matching context. */
export function toMessageSearchListResponse(
  page: readonly MessageRecord[],
  hasMore: boolean,
  authorMap: ReadonlyMap<string, UserRecord>,
  rawQuery: string,
): MessageSearchListResponse {
  const items = page.map((message) => {
    const author = authorMap.get(message.authorId);
    if (author === undefined) {
      throw new Error(`Author ${message.authorId} was not loaded for search results.`);
    }

    return {
      message: {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      },
      author: toPublicUserProfile(author),
      matchingContext: buildSearchMatchingContext(message.content, rawQuery),
    };
  });
  const oldest = items.at(-1);

  return {
    items,
    ...(hasMore && oldest !== undefined ? { nextCursor: oldest.message.id } : {}),
  };
}
