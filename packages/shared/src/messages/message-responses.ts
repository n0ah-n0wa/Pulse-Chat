import type { PublicUserProfile } from '../users/user-profile.js';

import type { AttachmentResponse } from '../attachments/attachment-responses.js';

/**
 * Reference to a file stored outside MongoDB (specification section 18).
 * Binary content is never persisted on the message document.
 */
export interface AttachmentReference {
  readonly id: string;
}

/** Aggregated reaction state returned with a message. */
export interface MessageReactionResponse {
  readonly emoji: string;
  readonly count: number;
  readonly reactedByCurrentUser: boolean;
}

/** Minimal quoted metadata for a replied-to message. */
export interface MessageReplyReferenceResponse {
  readonly id: string;
  readonly authorId: string;
  readonly content: string;
  readonly createdAt: string;
  readonly deletedAt?: string;
}

/** Result of creating a message, including whether a new row was persisted. */
export interface CreateMessageResult {
  readonly message: MessageResponse;
  readonly created: boolean;
}

/** Message payload returned by REST message endpoints. */
export interface MessageResponse {
  readonly id: string;
  readonly roomId: string;
  readonly authorId: string;
  readonly content: string;
  readonly clientMessageId: string;
  readonly replyToMessageId?: string;
  readonly replyTo?: MessageReplyReferenceResponse;
  readonly attachments: readonly AttachmentResponse[];
  readonly reactions: readonly MessageReactionResponse[];
  readonly editedAt?: string;
  readonly deletedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Cursor-paginated message history. `items` are newest-first.
 * Pass `nextCursor` as `before` to load the next (older) page.
 */
export interface MessageListResponse {
  readonly items: readonly MessageResponse[];
  readonly nextCursor?: string;
}

/** Minimal message payload included in a search hit. */
export interface MessageSearchMessageResponse {
  readonly id: string;
  readonly content: string;
  readonly createdAt: string;
}

/** One search result with author metadata and matching context. */
export interface MessageSearchHitResponse {
  readonly message: MessageSearchMessageResponse;
  readonly author: PublicUserProfile;
  readonly matchingContext: string;
}

/**
 * Cursor-paginated search results, newest-first.
 * Pass `nextCursor` as `before` to load the next (older) page.
 */
export interface MessageSearchListResponse {
  readonly items: readonly MessageSearchHitResponse[];
  readonly nextCursor?: string;
}
