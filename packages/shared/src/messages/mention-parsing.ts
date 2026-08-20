import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '../constants.js';

/**
 * Matches `@username` tokens where `username` conforms to the product
 * username rules. A negative lookbehind avoids email local-parts (`user@host`).
 * A negative lookahead rejects continuations with `.` (e.g. `@user.name`) and
 * ensures the mention ends at a username boundary.
 */
const MENTION_USERNAME_PATTERN = new RegExp(
  `(?<![A-Za-z0-9])@([A-Za-z0-9_-]{${String(USERNAME_MIN_LENGTH)},${String(USERNAME_MAX_LENGTH)}})(?!(?:[A-Za-z0-9_-]|\\.))`,
  'g',
);

/** 24-char hex strings are MongoDB ObjectIds — never treat them as mentions. */
const OBJECT_ID_LIKE_PATTERN = /^[a-fA-F0-9]{24}$/;

/**
 * Extracts unique `@username` tokens from message content.
 *
 * Usernames are returned exactly as written (case-sensitive). Tokens that
 * look like ObjectIds are excluded so mentions cannot target users by raw id.
 */
export function extractMentionUsernames(content: string): readonly string[] {
  const usernames: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = MENTION_USERNAME_PATTERN.exec(content)) !== null) {
    const username = match[1];
    if (username === undefined || OBJECT_ID_LIKE_PATTERN.test(username)) {
      continue;
    }

    usernames.push(username);
  }

  return [...new Set(usernames)];
}
