import { describe, expect, it } from 'vitest';

import { extractMentionUsernames } from './mention-parsing.js';

describe('extractMentionUsernames', () => {
  it('extracts a single @username mention', () => {
    expect(extractMentionUsernames('Hello @alice')).toEqual(['alice']);
  });

  it('extracts multiple distinct mentions', () => {
    expect(extractMentionUsernames('@alice and @bob please review')).toEqual(['alice', 'bob']);
  });

  it('deduplicates repeated mentions of the same username', () => {
    expect(extractMentionUsernames('@alice @alice @alice')).toEqual(['alice']);
  });

  it('does not treat email addresses as mentions', () => {
    expect(extractMentionUsernames('Email me at user@example.com')).toEqual([]);
  });

  it('does not treat 24-char hex ObjectIds as mentions', () => {
    expect(extractMentionUsernames('Hey @507f1f77bcf86cd799439011')).toEqual([]);
  });

  it('ignores @ tokens that are too short', () => {
    expect(extractMentionUsernames('Hi @ab')).toEqual([]);
  });

  it('ignores @ tokens with invalid characters', () => {
    expect(extractMentionUsernames('Hi @user.name')).toEqual([]);
  });

  it('extracts mentions followed by punctuation', () => {
    expect(extractMentionUsernames('Thanks @alice, @bob!')).toEqual(['alice', 'bob']);
  });

  it('extracts hyphenated usernames', () => {
    expect(extractMentionUsernames('Ping @user-name please')).toEqual(['user-name']);
  });

  it('returns an empty array when there are no mentions', () => {
    expect(extractMentionUsernames('No mentions here')).toEqual([]);
  });

  it('preserves username casing', () => {
    expect(extractMentionUsernames('@Alice @ALICE')).toEqual(['Alice', 'ALICE']);
  });
});
