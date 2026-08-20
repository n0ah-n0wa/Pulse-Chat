/**
 * Standard API error body returned by the backend (specification section 32).
 */
export interface ApiErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
}

/** Machine-readable codes for cross-cutting HTTP errors. */
export const API_ERROR_CODES = {
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
