import {
  type AllowedAttachmentMimeType,
} from '@pulse-chat/shared';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PDF_SIGNATURE = Buffer.from('%PDF-');

function startsWith(buffer: Buffer, signature: Buffer): boolean {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

function isGif(buffer: Buffer): boolean {
  return (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      buffer.subarray(0, 6).toString('ascii') === 'GIF89a')
  );
}

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

function isPlainText(buffer: Buffer): boolean {
  if (buffer.includes(0x00)) {
    return false;
  }

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects MIME type from file content.
 *
 * Client-declared MIME types are never consulted here.
 */
export function detectContentType(buffer: Buffer): AllowedAttachmentMimeType | null {
  if (startsWith(buffer, JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }

  if (startsWith(buffer, PNG_SIGNATURE)) {
    return 'image/png';
  }

  if (isGif(buffer)) {
    return 'image/gif';
  }

  if (isWebp(buffer)) {
    return 'image/webp';
  }

  if (startsWith(buffer, PDF_SIGNATURE)) {
    return 'application/pdf';
  }

  if (isPlainText(buffer)) {
    return 'text/plain';
  }

  return null;
}
