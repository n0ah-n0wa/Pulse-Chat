import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ATTACHMENT_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../../../common/errors/api.exception.js';
import { AppConfigService } from '../../../config/index.js';
import { LocalFileStorage } from './local-file-storage.js';

const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe('LocalFileStorage', () => {
  let tempDir: string;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-storage-'));
    const configService = {
      fileStorage: {
        provider: 'local',
        path: tempDir,
      },
    } as AppConfigService;
    storage = new LocalFileStorage(configService);
  });

  afterEach(async () => {
    // Temp directory cleanup is best-effort in tests.
  });

  it('writes uploaded files under the configured root and returns a URL', async () => {
    const result = await storage.upload({
      buffer: PNG_BUFFER,
      key: '00000000-0000-4000-8000-000000000001.png',
      mimeType: 'image/png',
      filename: 'screenshot.png',
    });

    const absolutePath = path.join(tempDir, result.key);
    const bytes = await readFile(absolutePath);
    expect(bytes.equals(PNG_BUFFER)).toBe(true);
    expect(result.url).toBe('/api/files/00000000-0000-4000-8000-000000000001.png');
    expect(result.sizeBytes).toBe(PNG_BUFFER.byteLength);
  });

  it('deletes an existing file and reports missing files', async () => {
    const key = '00000000-0000-4000-8000-000000000002.png';
    await storage.upload({
      buffer: PNG_BUFFER,
      key,
      mimeType: 'image/png',
      filename: 'screenshot.png',
    });

    await storage.delete(key);
    await expect(stat(path.join(tempDir, key))).rejects.toMatchObject({ code: 'ENOENT' });

    await expect(storage.delete(key)).rejects.toMatchObject({
      code: ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND,
    });
  });

  it('rejects unsafe keys before touching the filesystem', async () => {
    await expect(storage.getUrl('../outside.png')).rejects.toBeInstanceOf(ApiException);
    await expect(
      storage.upload({
        buffer: PNG_BUFFER,
        key: '../outside.png',
        mimeType: 'image/png',
        filename: 'x.png',
      }),
    ).rejects.toBeInstanceOf(ApiException);
  });
});
