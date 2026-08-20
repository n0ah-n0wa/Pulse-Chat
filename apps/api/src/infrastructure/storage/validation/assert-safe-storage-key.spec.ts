import { describe, expect, it } from 'vitest';

import { ATTACHMENT_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../../../common/errors/api.exception.js';
import { assertSafeStorageKey } from './assert-safe-storage-key.js';
import { generateStorageKey } from './generate-storage-key.js';

describe('assertSafeStorageKey', () => {
  it('accepts server-generated keys', () => {
    expect(() => assertSafeStorageKey(generateStorageKey('application/pdf'))).not.toThrow();
  });

  it('rejects path traversal and foreign key formats', () => {
    expect(() => assertSafeStorageKey('../etc/passwd')).toThrow(ApiException);
    expect(() => assertSafeStorageKey('../etc/passwd')).toThrow(
      expect.objectContaining({ code: ATTACHMENT_ERROR_CODES.INVALID_STORAGE_KEY }),
    );
    expect(() => assertSafeStorageKey('manual-name.exe')).toThrow(ApiException);
  });
});
