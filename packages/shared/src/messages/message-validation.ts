import { z } from 'zod';

import {
  MESSAGE_MAX_ATTACHMENTS,
  MESSAGE_MAX_LENGTH,
  MESSAGE_PAGE_SIZE_MAX,
  MESSAGE_SEARCH_QUERY_MAX_LENGTH,
} from '../constants.js';

/** Maximum length for a client-generated idempotency key. */
export const CLIENT_MESSAGE_ID_MAX_LENGTH = 128;

/** Canonical 24-character hex id used in message query parameters. */
export const messageResourceIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'must be a valid id');

export const messageContentSchema = z
  .string()
  .trim()
  .min(1, 'Message cannot be empty')
  .max(MESSAGE_MAX_LENGTH, `Message cannot exceed ${String(MESSAGE_MAX_LENGTH)} characters`);

export const clientMessageIdSchema = z
  .string()
  .trim()
  .min(1, 'Client message id is required')
  .max(
    CLIENT_MESSAGE_ID_MAX_LENGTH,
    `Client message id cannot exceed ${String(CLIENT_MESSAGE_ID_MAX_LENGTH)} characters`,
  );

export const createMessageSchema = z
  .object({
    content: messageContentSchema,
    clientMessageId: clientMessageIdSchema,
    replyToMessageId: messageResourceIdSchema.optional(),
    attachmentIds: z
      .array(messageResourceIdSchema)
      .max(
        MESSAGE_MAX_ATTACHMENTS,
        `A message cannot have more than ${String(MESSAGE_MAX_ATTACHMENTS)} attachments`,
      )
      .optional(),
  })
  .strict();

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const updateMessageSchema = z
  .object({
    content: messageContentSchema,
  })
  .strict();

export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;

export const reactionEmojiSchema = z
  .string()
  .trim()
  .min(1, 'Emoji is required')
  .max(32, 'Emoji must be 32 characters or fewer');

export const addReactionSchema = z
  .object({
    emoji: reactionEmojiSchema,
  })
  .strict();

export type AddReactionInput = z.infer<typeof addReactionSchema>;

export const listMessagesQuerySchema = z
  .object({
    limit: z.preprocess((value: unknown) => {
      if (value === undefined || value === '') {
        return undefined;
      }
      if (typeof value === 'number' || typeof value === 'string') {
        return Number(value);
      }
      return value;
    }, z.number().int().min(1).max(MESSAGE_PAGE_SIZE_MAX).optional()),
    before: z.preprocess((value: unknown) => {
      if (value === undefined || value === '') {
        return undefined;
      }
      return value;
    }, messageResourceIdSchema.optional()),
  })
  .strict();

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const searchMessagesQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(1, 'Search query cannot be empty')
      .max(
        MESSAGE_SEARCH_QUERY_MAX_LENGTH,
        `Search query cannot exceed ${String(MESSAGE_SEARCH_QUERY_MAX_LENGTH)} characters`,
      ),
    limit: z.preprocess((value: unknown) => {
      if (value === undefined || value === '') {
        return undefined;
      }
      if (typeof value === 'number' || typeof value === 'string') {
        return Number(value);
      }
      return value;
    }, z.number().int().min(1).max(MESSAGE_PAGE_SIZE_MAX).optional()),
    before: z.preprocess((value: unknown) => {
      if (value === undefined || value === '') {
        return undefined;
      }
      return value;
    }, messageResourceIdSchema.optional()),
  })
  .strict();

export type SearchMessagesQuery = z.infer<typeof searchMessagesQuerySchema>;
