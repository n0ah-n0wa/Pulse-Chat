import { getApiBaseUrl } from '../lib/env';
import { ApiClientError, parseApiErrorBody } from '../lib/errors';
import { useAuthStore } from '../store/auth-store';

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

/** Typed fetch wrapper for Pulse Chat REST endpoints. */
export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<TResponse> {
  const includeAuth = options.auth !== false;
  const headers = buildHeaders(options, includeAuth);
  const body =
    options.json !== undefined ? JSON.stringify(options.json) : (options.body ?? undefined);

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
    body,
  });

  if (!response.ok) {
    const errorBody = await parseApiErrorBody(response);
    throw new ApiClientError(errorBody.statusCode, errorBody.code, errorBody.message);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
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
