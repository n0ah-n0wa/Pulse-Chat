import { describe, expect, it } from 'vitest';

import {
  ATTACHMENT_MAX_BYTES,
  DIRECTORY_SEARCH_LIMIT_DEFAULT,
  DIRECTORY_SEARCH_LIMIT_MAX,
  DIRECTORY_SEARCH_QUERY_MAX_LENGTH,
  MESSAGE_MAX_ATTACHMENTS,
  MESSAGE_MAX_LENGTH,
  MESSAGE_PAGE_SIZE_DEFAULT,
  MESSAGE_PAGE_SIZE_MAX,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from './constants.js';

describe('shared constants', () => {
  it('matches the limits defined in the specification', () => {
    expect(MESSAGE_MAX_LENGTH).toBe(4000);
    expect(MESSAGE_PAGE_SIZE_DEFAULT).toBe(50);
    expect(MESSAGE_PAGE_SIZE_MAX).toBe(100);
    expect(USERNAME_MIN_LENGTH).toBe(3);
    expect(USERNAME_MAX_LENGTH).toBe(32);
    expect(ATTACHMENT_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(MESSAGE_MAX_ATTACHMENTS).toBe(10);
    expect(DIRECTORY_SEARCH_QUERY_MAX_LENGTH).toBe(64);
    expect(DIRECTORY_SEARCH_LIMIT_DEFAULT).toBe(20);
    expect(DIRECTORY_SEARCH_LIMIT_MAX).toBe(50);
    expect(DIRECTORY_SEARCH_LIMIT_DEFAULT).toBeLessThanOrEqual(DIRECTORY_SEARCH_LIMIT_MAX);
  });

  it('never lets a client request more history than the maximum page size', () => {
    expect(MESSAGE_PAGE_SIZE_DEFAULT).toBeLessThanOrEqual(MESSAGE_PAGE_SIZE_MAX);
  });
});
