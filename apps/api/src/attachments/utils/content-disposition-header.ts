import type { AllowedAttachmentMimeType } from '@pulse-chat/shared';

const INLINE_MIME_TYPES = new Set<AllowedAttachmentMimeType>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

/** Quotes a filename for the ASCII `filename` parameter. */
function quotedFilename(filename: string): string {
  return filename
    .replaceAll('\\', '_')
    .replaceAll('"', '_')
    .replaceAll(/[\r\n]/g, '_');
}

/**
 * Builds a Content-Disposition value that cannot inject extra headers.
 *
 * Images are shown inline; other allowed types are downloaded as attachments.
 */
export function contentDispositionHeader(filename: string, mimeType: string): string {
  const disposition = INLINE_MIME_TYPES.has(mimeType as AllowedAttachmentMimeType)
    ? 'inline'
    : 'attachment';
  const encoded = encodeURIComponent(filename);

  return `${disposition}; filename="${quotedFilename(filename)}"; filename*=UTF-8''${encoded}`;
}
