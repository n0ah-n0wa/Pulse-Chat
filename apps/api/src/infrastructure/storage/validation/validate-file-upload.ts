import { HttpStatus } from '@nestjs/common';

import {
  ATTACHMENT_ERROR_CODES,
  ATTACHMENT_MAX_BYTES,
} from '@pulse-chat/shared';

import { ApiException } from '../../../common/errors/api.exception.js';
import type {
  FileUploadInput,
  ValidatedFileUpload,
} from '../file-storage.interface.js';
import { detectContentType } from './detect-content-type.js';
import { generateStorageKey } from './generate-storage-key.js';
import { sanitizeFilename } from './sanitize-filename.js';

/** Validates size, content type, filename, and produces a safe storage key. */
export function validateFileUpload(input: FileUploadInput): ValidatedFileUpload {
  if (input.buffer.length === 0) {
    throw new ApiException(
      ATTACHMENT_ERROR_CODES.INVALID_FILE_TYPE,
      'File is empty.',
      HttpStatus.BAD_REQUEST,
    );
  }

  if (input.buffer.length > ATTACHMENT_MAX_BYTES) {
    throw new ApiException(
      ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE,
      `File exceeds the ${String(ATTACHMENT_MAX_BYTES)} byte limit.`,
      HttpStatus.BAD_REQUEST,
    );
  }

  const mimeType = detectContentType(input.buffer);
  if (mimeType === null) {
    throw new ApiException(
      ATTACHMENT_ERROR_CODES.INVALID_FILE_TYPE,
      'File type is not allowed.',
      HttpStatus.BAD_REQUEST,
    );
  }

  const filename = sanitizeFilename(input.declaredFilename);
  const key = generateStorageKey(mimeType);

  return {
    buffer: input.buffer,
    key,
    mimeType,
    filename,
  };
}
