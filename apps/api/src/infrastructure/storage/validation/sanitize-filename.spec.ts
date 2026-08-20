import { describe, expect, it } from 'vitest';

import { ATTACHMENT_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../../../common/errors/api.exception.js';
import { sanitizeFilename } from './sanitize-filename.js';

describe('sanitizeFilename', () => {
  it('strips directory components and reserved characters', () => {
    expect(sanitizeFilename('../../secret/report final.pdf')).toBe('report final.pdf');
    expect(sanitizeFilename('photo:name?.png')).toBe('photo_name_.png');
  });

  it('rejects empty filenames after sanitization', () => {
    expect(() => sanitizeFilename('   ')).toThrow(ApiException);
    expect(() => sanitizeFilename('   ')).toThrow(
      expect.objectContaining({ code: ATTACHMENT_ERROR_CODES.INVALID_FILENAME }),
    );
  });
});
