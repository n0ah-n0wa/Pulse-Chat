import { describe, expect, it } from 'vitest';

import {
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
  });

  it('never lets a client request more history than the maximum page size', () => {
    expect(MESSAGE_PAGE_SIZE_DEFAULT).toBeLessThanOrEqual(MESSAGE_PAGE_SIZE_MAX);
  });
});
