import { ApiClientError, parseApiErrorBody } from '../lib/errors';
import { getApiBaseUrl } from '../lib/env';
import { queryClient } from '../lib/query-client';
import { resetClientState } from '../lib/reset-client-state';
import { useAuthStore } from '../store/auth-store';
import { refreshAccessToken } from './token-refresh';

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  readonly auth?: boolean;
  readonly body?: BodyInit | null;
  readonly json?: unknown;
}

function buildHeaders(options: ApiRequestOptions, includeAuth: boolean): Headers {
  const headers = new Headers(options.headers);

  if (options.json !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (includeAuth) {
    const token = useAuthStore.getState().accessToken;
    if (token !== null) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  return headers;
}

function isCredentialRequest(path: string): boolean {
  return (
    path.startsWith('/api/auth/login') ||
    path.startsWith('/api/auth/register') ||
    path.startsWith('/api/auth/refresh') ||
    path.startsWith('/api/auth/logout')
  );
}

async function executeRequest(path: string, options: ApiRequestOptions): Promise<Response> {
  const includeAuth = options.auth !== false;
  const headers = buildHeaders(options, includeAuth);
  const body =
    options.json !== undefined ? JSON.stringify(options.json) : (options.body ?? undefined);

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
    body,
  });
}

async function throwFromResponse(response: Response): Promise<never> {
  const errorBody = await parseApiErrorBody(response);
  throw new ApiClientError(errorBody.statusCode, errorBody.code, errorBody.message);
}

async function parseSuccess<TResponse>(response: Response): Promise<TResponse> {
  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

/** Typed fetch wrapper for Pulse Chat REST endpoints. */
export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<TResponse> {
  const includeAuth = options.auth !== false;
  const response = await executeRequest(path, options);

  if (response.ok) {
    return parseSuccess<TResponse>(response);
  }

  if (response.status === 401 && includeAuth && !isCredentialRequest(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retried = await executeRequest(path, options);
      if (retried.ok) {
        return parseSuccess<TResponse>(retried);
      }

      if (retried.status === 401) {
        resetClientState(queryClient);
      }

      return throwFromResponse(retried);
    }
  }

  return throwFromResponse(response);
}

export const apiClient = {
  get<TResponse>(path: string, options: Omit<ApiRequestOptions, 'method' | 'json' | 'body'> = {}) {
    return apiRequest<TResponse>(path, { ...options, method: 'GET' });
  },
  post<TResponse>(
    path: string,
    json?: unknown,
    options: Omit<ApiRequestOptions, 'method' | 'json' | 'body'> = {},
  ) {
    return apiRequest<TResponse>(path, { ...options, method: 'POST', json });
  },
  patch<TResponse>(
    path: string,
    json?: unknown,
    options: Omit<ApiRequestOptions, 'method' | 'json' | 'body'> = {},
  ) {
    return apiRequest<TResponse>(path, { ...options, method: 'PATCH', json });
  },
  delete<TResponse>(
    path: string,
    options: Omit<ApiRequestOptions, 'method' | 'json' | 'body'> = {},
  ) {
    return apiRequest<TResponse>(path, { ...options, method: 'DELETE' });
  },
};
