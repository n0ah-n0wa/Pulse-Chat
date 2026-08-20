import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ATTACHMENT_ERROR_CODES } from '@pulse-chat/shared';

import { FileUploadService } from './file-upload.service.js';
import type { FileStorage } from './file-storage.interface.js';

const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe('FileUploadService', () => {
  const upload = vi.fn<FileStorage['upload']>();
  const deleteFile = vi.fn<FileStorage['delete']>();
  const getUrl = vi.fn<FileStorage['getUrl']>();

  const storage: FileStorage = { upload, delete: deleteFile, getUrl };
  const service = new FileUploadService(storage);

  beforeEach(() => {
    vi.resetAllMocks();
    upload.mockResolvedValue({
      key: '00000000-0000-4000-8000-000000000099.png',
      url: '/api/files/00000000-0000-4000-8000-000000000099.png',
      mimeType: 'image/png',
      sizeBytes: PNG_BUFFER.byteLength,
      filename: 'screenshot.png',
    });
    getUrl.mockResolvedValue('/api/files/00000000-0000-4000-8000-000000000099.png');
  });

  it('validates uploads before delegating to the storage provider', async () => {
    const result = await service.upload({
      buffer: PNG_BUFFER,
      declaredMimeType: 'application/octet-stream',
      declaredFilename: 'screenshot.png',
    });

    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0]?.[0]?.mimeType).toBe('image/png');
    expect(upload.mock.calls[0]?.[0]?.key.endsWith('.png')).toBe(true);
    expect(result.filename).toBe('screenshot.png');
  });

  it('validates storage keys for delete and getUrl', async () => {
    await service.delete('00000000-0000-4000-8000-000000000099.png');
    await service.getUrl('00000000-0000-4000-8000-000000000099.png');

    expect(deleteFile).toHaveBeenCalledOnce();
    expect(getUrl).toHaveBeenCalledOnce();

    await expect(service.delete('../escape.png')).rejects.toMatchObject({
      code: ATTACHMENT_ERROR_CODES.INVALID_STORAGE_KEY,
    });
  });
});
