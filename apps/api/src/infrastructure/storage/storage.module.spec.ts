import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppConfigModule } from '../../config/index.js';
import { FILE_STORAGE } from './file-storage.tokens.js';
import { FileUploadService } from './file-upload.service.js';
import { StorageModule } from './storage.module.js';
import type { FileStorage } from './file-storage.interface.js';

describe('StorageModule', () => {
  let tempDir: string;
  const previousEnv = { ...process.env };

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-storage-module-'));
    process.env['NODE_ENV'] = 'test';
    process.env['MONGODB_URI'] = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/pulse_chat_test';
    process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://localhost:6379/1';
    process.env['CORS_ORIGIN'] = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';
    process.env['FILE_STORAGE_PROVIDER'] = 'local';
    process.env['FILE_STORAGE_PATH'] = tempDir;
  });

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('registers the local FileStorage provider and FileUploadService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, StorageModule],
    }).compile();

    const storage = moduleRef.get<FileStorage>(FILE_STORAGE);
    const uploadService = moduleRef.get(FileUploadService);

    expect(typeof storage.upload).toBe('function');
    expect(typeof storage.delete).toBe('function');
    expect(typeof storage.getUrl).toBe('function');
    expect(typeof uploadService.upload).toBe('function');

    await moduleRef.close();
  });
});
