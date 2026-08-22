import { describe, expect, it } from 'vitest';

import {
  searchUsersQuerySchema,
  updateUserProfileSchema,
  usernameSchema,
} from './user-validation.js';

describe('usernameSchema', () => {
  it('accepts valid usernames', () => {
    expect(usernameSchema.parse('alex')).toBe('alex');
    expect(usernameSchema.parse('user_123')).toBe('user_123');
    expect(usernameSchema.parse('cool-name')).toBe('cool-name');
  });

  it('rejects usernames that are too short or too long', () => {
    expect(() => usernameSchema.parse('ab')).toThrow(/at least 3/);
    expect(() => usernameSchema.parse('a'.repeat(33))).toThrow(/at most 32/);
  });

  it('rejects usernames with invalid characters', () => {
    expect(() => usernameSchema.parse('bad name')).toThrow(/letters, numbers/);
    expect(() => usernameSchema.parse('user@name')).toThrow(/letters, numbers/);
  });
});

describe('searchUsersQuerySchema', () => {
  it('trims the query and accepts an optional limit', () => {
    expect(searchUsersQuerySchema.parse({ q: '  alex  ', limit: '10' })).toEqual({
      q: 'alex',
      limit: 10,
    });
  });

  it('strips a leading @ or # from mention-style queries', () => {
    expect(searchUsersQuerySchema.parse({ q: '  @Alex  ' })).toEqual({ q: 'Alex' });
    expect(searchUsersQuerySchema.parse({ q: '#general' })).toEqual({ q: 'general' });
  });

  it('rejects an empty query', () => {
    expect(() => searchUsersQuerySchema.parse({ q: '   ' })).toThrow(/cannot be empty/);
    expect(() => searchUsersQuerySchema.parse({ q: '@@@' })).toThrow(/cannot be empty/);
  });
});

describe('updateUserProfileSchema', () => {
  it('accepts partial profile updates', () => {
    expect(updateUserProfileSchema.parse({ displayName: 'Alex' })).toEqual({
      displayName: 'Alex',
    });
    expect(updateUserProfileSchema.parse({ username: 'new_name' })).toEqual({
      username: 'new_name',
    });
    expect(updateUserProfileSchema.parse({ bio: 'Hello there' })).toEqual({
      bio: 'Hello there',
    });
  });

  it('requires at least one field', () => {
    expect(() => updateUserProfileSchema.parse({})).toThrow(/At least one profile field/);
  });

  it('rejects unknown fields', () => {
    expect(() =>
      updateUserProfileSchema.parse({ displayName: 'Alex', passwordHash: 'secret' }),
    ).toThrow();
  });
});
