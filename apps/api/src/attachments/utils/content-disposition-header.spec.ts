import { describe, expect, it } from 'vitest';

import { contentDispositionHeader } from './content-disposition-header.js';

describe('contentDispositionHeader', () => {
  it('serves images inline', () => {
    expect(contentDispositionHeader('photo.png', 'image/png')).toBe(
      'inline; filename="photo.png"; filename*=UTF-8\'\'photo.png',
    );
  });

  it('forces downloads for non-image types', () => {
    expect(contentDispositionHeader('notes.txt', 'text/plain')).toContain('attachment;');
    expect(contentDispositionHeader('doc.pdf', 'application/pdf')).toContain('attachment;');
  });

  it('neutralizes quote and newline characters in filenames', () => {
    const header = contentDispositionHeader('a"\r\nSet-Cookie: x=1.txt', 'text/plain');

    expect(header).not.toMatch(/\r|\n/);
    expect(header).not.toContain('"a"');
    expect(header.startsWith('attachment;')).toBe(true);
  });
});
