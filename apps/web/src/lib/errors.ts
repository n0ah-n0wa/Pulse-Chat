import type { ApiErrorBody } from '@pulse-chat/shared';
import { API_ERROR_CODES } from '@pulse-chat/shared';

/** Typed HTTP failure surfaced by the API client. */
export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export async function parseApiErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'statusCode' in body &&
      'code' in body &&
      'message' in body &&
      typeof body.statusCode === 'number' &&
      typeof body.code === 'string' &&
      typeof body.message === 'string'
    ) {
      return body as ApiErrorBody;
    }
  } catch {
    // Fall through to a generic body below.
  }

  return {
    statusCode: response.status,
    code: API_ERROR_CODES.BAD_REQUEST,
    message: response.statusText || 'Request failed.',
  };
}

/** Normalises unknown failures for UI and logging boundaries. */
export function toDisplayErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (isApiClientError(error)) {
    return error.message;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}
