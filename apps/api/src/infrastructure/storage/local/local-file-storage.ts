import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { HttpStatus, Injectable } from '@nestjs/common';

import { ATTACHMENT_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../../../common/errors/api.exception.js';
import { AppConfigService } from '../../../config/index.js';
import type {
  FileStorage,
  FileStorageUploadResult,
  ValidatedFileUpload,
} from '../file-storage.interface.js';
import { assertSafeStorageKey } from '../validation/assert-safe-storage-key.js';

/** Persists attachments on the local filesystem for development. */
@Injectable()
export class LocalFileStorage implements FileStorage {
  constructor(private readonly config: AppConfigService) {}

  async upload(input: ValidatedFileUpload): Promise<FileStorageUploadResult> {
    assertSafeStorageKey(input.key);

    const storageRoot = this.resolveStorageRoot();
    const absolutePath = path.join(storageRoot, input.key);

    await mkdir(storageRoot, { recursive: true });
    await writeFile(absolutePath, input.buffer, { flag: 'wx' });

    return {
      key: input.key,
      url: this.buildUrl(input.key),
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
      filename: input.filename,
    };
  }

  async delete(key: string): Promise<void> {
    assertSafeStorageKey(key);

    const absolutePath = path.join(this.resolveStorageRoot(), key);

    try {
      await unlink(absolutePath);
    } catch (error) {
      if (isEnoent(error)) {
        throw new ApiException(
          ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND,
          'File not found.',
          HttpStatus.NOT_FOUND,
        );
      }
      throw error;
    }
  }

  async getUrl(key: string): Promise<string> {
    assertSafeStorageKey(key);
    await Promise.resolve();
    return this.buildUrl(key);
  }

  private resolveStorageRoot(): string {
    const configuredPath = this.config.fileStorage.path;
    if (configuredPath === undefined || configuredPath.trim().length === 0) {
      throw new Error('FILE_STORAGE_PATH is required for the local storage provider.');
    }

    return path.resolve(configuredPath);
  }

  private buildUrl(key: string): string {
    return `/api/files/${encodeURIComponent(key)}`;
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export const localFileStorageProviders = [
  LocalFileStorage,
] as const;
