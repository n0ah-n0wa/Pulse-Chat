import { describe, expect, it } from 'vitest';

import { MESSAGE_MAX_LENGTH, MESSAGE_PAGE_SIZE_MAX } from '../constants.js';
import {
  addReactionSchema,
  CLIENT_MESSAGE_ID_MAX_LENGTH,
  createMessageSchema,
  listMessagesQuerySchema,
  reactionEmojiSchema,
  updateMessageSchema,
} from './message-validation.js';

describe('createMessageSchema', () => {
  it('accepts a trimmed non-empty message with a client id', () => {
    expect(
      createMessageSchema.parse({
        content: '  Hello room  ',
        clientMessageId: '  client-1  ',
      }),
    ).toEqual({
      content: 'Hello room',
      clientMessageId: 'client-1',
    });
  });

  it('accepts an optional reply target id', () => {
    expect(
      createMessageSchema.parse({
        content: 'Reply',
        clientMessageId: 'client-2',
        replyToMessageId: '507f1f77bcf86cd799439011',
      }),
    ).toEqual({
      content: 'Reply',
      clientMessageId: 'client-2',
      replyToMessageId: '507f1f77bcf86cd799439011',
    });
  });

  it('rejects empty and whitespace-only content', () => {
    expect(() =>
      createMessageSchema.parse({ content: '', clientMessageId: 'client-1' }),
    ).toThrow(/empty/);
    expect(() =>
      createMessageSchema.parse({ content: '   \n\t  ', clientMessageId: 'client-1' }),
    ).toThrow(/empty/);
  });

  it('rejects oversized content', () => {
    expect(() =>
      createMessageSchema.parse({
        content: 'a'.repeat(MESSAGE_MAX_LENGTH + 1),
        clientMessageId: 'client-1',
      }),
    ).toThrow(/4000/);
  });

  it('accepts content at the maximum length', () => {
    expect(
      createMessageSchema.parse({
        content: 'a'.repeat(MESSAGE_MAX_LENGTH),
        clientMessageId: 'client-1',
      }).content,
    ).toHaveLength(MESSAGE_MAX_LENGTH);
  });

  it('rejects a missing or oversized client message id', () => {
    expect(() => createMessageSchema.parse({ content: 'Hello' })).toThrow();
    expect(() =>
      createMessageSchema.parse({
        content: 'Hello',
        clientMessageId: 'x'.repeat(CLIENT_MESSAGE_ID_MAX_LENGTH + 1),
      }),
    ).toThrow();
  });

  it('rejects unknown fields', () => {
    expect(() =>
      createMessageSchema.parse({
        content: 'Hello',
        clientMessageId: 'client-1',
        extra: true,
      }),
    ).toThrow();
  });
});

describe('updateMessageSchema', () => {
  it('accepts trimmed content', () => {
    expect(updateMessageSchema.parse({ content: '  Edited  ' })).toEqual({ content: 'Edited' });
  });

  it('rejects empty, whitespace-only, and oversized content', () => {
    expect(() => updateMessageSchema.parse({ content: '' })).toThrow(/empty/);
    expect(() => updateMessageSchema.parse({ content: '   ' })).toThrow(/empty/);
    expect(() =>
      updateMessageSchema.parse({ content: 'a'.repeat(MESSAGE_MAX_LENGTH + 1) }),
    ).toThrow(/4000/);
  });

  it('rejects unknown fields', () => {
    expect(() => updateMessageSchema.parse({ content: 'Hi', extra: true })).toThrow();
  });
});

describe('addReactionSchema', () => {
  it('accepts a trimmed emoji payload', () => {
    expect(addReactionSchema.parse({ emoji: '  👍  ' })).toEqual({ emoji: '👍' });
  });

  it('rejects an empty emoji', () => {
    expect(() => addReactionSchema.parse({ emoji: '   ' })).toThrow(/Emoji is required/);
    expect(() => reactionEmojiSchema.parse('')).toThrow(/Emoji is required/);
  });
});

describe('listMessagesQuerySchema', () => {
  it('accepts an empty query and omits optional fields', () => {
    expect(listMessagesQuerySchema.parse({})).toEqual({});
  });

  it('coerces a string limit and accepts a message-id cursor', () => {
    expect(
      listMessagesQuerySchema.parse({
        limit: '25',
        before: '507f1f77bcf86cd799439011',
      }),
    ).toEqual({
      limit: 25,
      before: '507f1f77bcf86cd799439011',
    });
  });

  it('rejects a limit above the maximum page size', () => {
    expect(() =>
      listMessagesQuerySchema.parse({ limit: String(MESSAGE_PAGE_SIZE_MAX + 1) }),
    ).toThrow();
  });

  it('rejects a malformed cursor', () => {
    expect(() => listMessagesQuerySchema.parse({ before: 'not-an-id' })).toThrow();
  });
});
