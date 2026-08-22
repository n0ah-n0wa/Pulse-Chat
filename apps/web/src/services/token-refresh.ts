import type { AuthTokensResponse } from '@pulse-chat/shared';

import { getApiBaseUrl } from '../lib/env';
import { queryClient } from '../lib/query-client';
import { resetClientState } from '../lib/reset-client-state';
import { currentSessionGeneration } from '../lib/session-generation';
import { useAuthStore } from '../store/auth-store';

let refreshInFlight: Promise<boolean> | null = null;

function isAuthTokensResponse(value: unknown): value is AuthTokensResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record['accessToken'] === 'string' &&
    typeof record['refreshToken'] === 'string' &&
    typeof record['accessTokenExpiresIn'] === 'number' &&
    typeof record['tokenType'] === 'string'
  );
}

async function rotateRefreshToken(): Promise<boolean> {
  const generation = currentSessionGeneration();
  const refreshToken = useAuthStore.getState().refreshToken;
  if (refreshToken === null) {
    return false;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (currentSessionGeneration() !== generation) {
      return false;
    }

    if (!response.ok) {
      resetClientState(queryClient);
      return false;
    }

    const body: unknown = await response.json();
    if (currentSessionGeneration() !== generation) {
      return false;
    }

    if (!isAuthTokensResponse(body)) {
      resetClientState(queryClient);
      return false;
    }

    useAuthStore.getState().applyTokens(body);
    return true;
  } catch {
    if (currentSessionGeneration() === generation) {
      resetClientState(queryClient);
    }
    return false;
  }
}

/**
 * Single-flight access-token rotation. Concurrent 401s share one refresh.
 * Returns false when the session cannot be recovered.
 */
export function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= rotateRefreshToken().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}
