import { describe, expect, it } from 'vitest';

import { detectContentType } from './detect-content-type.js';

const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF_BUFFER = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(4)]);
const WEBP_BUFFER = (() => {
  const buffer = Buffer.alloc(16);
  buffer.write('RIFF', 0);
  buffer.write('WEBP', 8);
  return buffer;
})();
const PDF_BUFFER = Buffer.from('%PDF-1.4\n');
const TEXT_BUFFER = Buffer.from('hello attachment', 'utf8');
const EXECUTABLE_BUFFER = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

describe('detectContentType', () => {
  it('detects supported image and document signatures from content', () => {
    expect(detectContentType(PNG_BUFFER)).toBe('image/png');
    expect(detectContentType(JPEG_BUFFER)).toBe('image/jpeg');
    expect(detectContentType(GIF_BUFFER)).toBe('image/gif');
    expect(detectContentType(WEBP_BUFFER)).toBe('image/webp');
    expect(detectContentType(PDF_BUFFER)).toBe('application/pdf');
    expect(detectContentType(TEXT_BUFFER)).toBe('text/plain');
  });

  it('rejects unknown binary content regardless of declared MIME type elsewhere', () => {
    expect(detectContentType(EXECUTABLE_BUFFER)).toBeNull();
  });
});
