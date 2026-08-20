import type { AttachmentResponse } from '@pulse-chat/shared';

import type { AttachmentRecord } from './attachment.repository.interface.js';

/** Maps a persisted attachment to the public API shape. */
export function toAttachmentResponse(
  attachment: AttachmentRecord,
  url: string,
): AttachmentResponse {
  return {
    id: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    url,
    createdAt: attachment.createdAt.toISOString(),
  };
}
