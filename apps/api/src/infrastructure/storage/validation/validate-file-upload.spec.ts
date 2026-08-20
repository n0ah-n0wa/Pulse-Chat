import { describe, expect, it } from 'vitest';

import { ATTACHMENT_ERROR_CODES, ATTACHMENT_MAX_BYTES } from '@pulse-chat/shared';

import { validateFileUpload } from './validate-file-upload.js';

const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe('validateFileUpload', () => {
  it('uses content sniffing instead of the declared MIME type', () => {
    const validated = validateFileUpload({
      buffer: JPEG_BUFFER,
      declaredMimeType: 'image/png',
      declaredFilename: '../../evil.exe',
    });

    expect(validated.mimeType).toBe('image/jpeg');
    expect(validated.filename).toBe('evil.exe');
    expect(validated.key.endsWith('.jpg')).toBe(true);
  });

  it('rejects empty, oversized, and disallowed files', () => {
    expect(() =>
      validateFileUpload({ buffer: Buffer.alloc(0), declaredFilename: 'empty.png' }),
    ).toThrow(expect.objectContaining({ code: ATTACHMENT_ERROR_CODES.INVALID_FILE_TYPE }));

    expect(() =>
      validateFileUpload({
        buffer: Buffer.alloc(ATTACHMENT_MAX_BYTES + 1, 0x00),
        declaredFilename: 'big.bin',
      }),
    ).toThrow(expect.objectContaining({ code: ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE }));

    expect(() =>
      validateFileUpload({
        buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
        declaredFilename: 'binary.bin',
      }),
    ).toThrow(expect.objectContaining({ code: ATTACHMENT_ERROR_CODES.INVALID_FILE_TYPE }));
  });

  it('accepts a valid PNG with a sanitized filename', () => {
    const validated = validateFileUpload({
      buffer: PNG_BUFFER,
      declaredFilename: 'screenshot.png',
    });

    expect(validated.mimeType).toBe('image/png');
    expect(validated.filename).toBe('screenshot.png');
    expect(validated.key.endsWith('.png')).toBe(true);
  });
});
