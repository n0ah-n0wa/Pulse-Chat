import { Inject, Injectable } from '@nestjs/common';

import type {
  FileStorage,
  FileStorageUploadResult,
  FileUploadInput,
} from './file-storage.interface.js';
import { FILE_STORAGE } from './file-storage.tokens.js';
import { assertSafeStorageKey } from './validation/assert-safe-storage-key.js';
import { validateFileUpload } from './validation/validate-file-upload.js';

/**
 * Validates uploads and delegates persistence to a {@link FileStorage} provider.
 *
 * Message and HTTP layers should depend on this service rather than on filesystem
 * or cloud SDK APIs directly.
 */
@Injectable()
export class FileUploadService {
  constructor(@Inject(FILE_STORAGE) private readonly storage: FileStorage) {}

  async upload(input: FileUploadInput): Promise<FileStorageUploadResult> {
    const validated = validateFileUpload(input);
    return this.storage.upload(validated);
  }

  async delete(key: string): Promise<void> {
    assertSafeStorageKey(key);
    await this.storage.delete(key);
  }

  async getUrl(key: string): Promise<string> {
    assertSafeStorageKey(key);
    return this.storage.getUrl(key);
  }
}
