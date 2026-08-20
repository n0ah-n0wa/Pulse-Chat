import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import { ApiClientError, isApiClientError, toDisplayErrorMessage } from './errors';

describe('errors', () => {
  it('identifies ApiClientError instances', () => {
    const error = new ApiClientError(403, API_ERROR_CODES.FORBIDDEN, 'Forbidden');

    expect(isApiClientError(error)).toBe(true);
    expect(toDisplayErrorMessage(error)).toBe('Forbidden');
  });

  it('falls back for unknown errors', () => {
    expect(toDisplayErrorMessage(undefined, 'Fallback')).toBe('Fallback');
  });
});
