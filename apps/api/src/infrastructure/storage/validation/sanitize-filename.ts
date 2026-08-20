import path from 'node:path';

import { HttpStatus } from '@nestjs/common';

import { ATTACHMENT_FILENAME_MAX_LENGTH, ATTACHMENT_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../../../common/errors/api.exception.js';

const UNSAFE_FILENAME_CHARACTERS = /[\\/:*?"<>|?]+/g;

function stripControlCharacters(value: string): string {
  let result = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code === 0 || code < 32 || code === 127) {
      result += '_';
      continue;
    }
    result += character;
  }
  return result;
}

/**
 * Derives a safe display filename from untrusted client input.
 *
 * Path segments, control characters, and platform-reserved symbols are removed.
 * The result is never used as a storage key.
 */
export function sanitizeFilename(rawFilename: string | undefined): string {
  const basename = path.basename(rawFilename ?? '').trim();
  const withoutUnsafe = stripControlCharacters(basename)
    .replace(UNSAFE_FILENAME_CHARACTERS, '_')
    .replace(/\.+/g, '.');
  const trimmed = withoutUnsafe.replace(/^\.+/, '').replace(/\.+$/, '').trim();

  if (trimmed.length === 0) {
    throw new ApiException(
      ATTACHMENT_ERROR_CODES.INVALID_FILENAME,
      'Filename is invalid.',
      HttpStatus.BAD_REQUEST,
    );
  }

  if (trimmed.length > ATTACHMENT_FILENAME_MAX_LENGTH) {
    return trimmed.slice(0, ATTACHMENT_FILENAME_MAX_LENGTH);
  }

  return trimmed;
}
