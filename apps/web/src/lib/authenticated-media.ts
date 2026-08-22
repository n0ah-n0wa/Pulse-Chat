import { refreshAccessToken } from '../services/token-refresh';
import { useAuthStore } from '../store/auth-store';
import { getApiBaseUrl } from './env';
import { ApiClientError, parseApiErrorBody } from './errors';
import { queryClient } from './query-client';
import { resetClientState } from './reset-client-state';

const API_FILES_PREFIX = '/api/files/';

function isApiFilesPath(pathname: string): boolean {
  return pathname.startsWith(API_FILES_PREFIX) && !pathname.includes('..');
}

function resolveAuthenticatedMediaUrl(url: string): string {
  if (url.startsWith('//') || url.includes('\\')) {
    throw new Error('Authenticated media URL is not allowed.');
  }

  if (url.startsWith(API_FILES_PREFIX)) {
    if (!isApiFilesPath(url.split('?')[0] ?? url)) {
      throw new Error('Authenticated media URL is not allowed.');
    }

    return `${getApiBaseUrl()}${url}`;
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    const base = getApiBaseUrl();
    if (base.length === 0) {
      throw new Error('Authenticated media URL is not allowed.');
    }

    let resolved: URL;
    let allowed: URL;
    try {
      resolved = new URL(url);
      allowed = new URL(base);
    } catch {
      throw new Error('Authenticated media URL is not allowed.');
    }

    if (resolved.origin !== allowed.origin || !isApiFilesPath(resolved.pathname)) {
      throw new Error('Authenticated media URL is not allowed.');
    }

    return resolved.href;
  }

  throw new Error('Authenticated media URL is not allowed.');
}

async function fetchWithBearer(url: string, accessToken: string): Promise<Response> {
  return fetch(resolveAuthenticatedMediaUrl(url), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/** Downloads an authenticated file and returns an object URL. Caller must revoke it. */
export async function fetchAuthenticatedObjectUrl(url: string): Promise<string> {
  const firstToken = useAuthStore.getState().accessToken;
  if (firstToken === null) {
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Not authenticated.');
  }

  let response = await fetchWithBearer(url, firstToken);

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    const nextToken = useAuthStore.getState().accessToken;
    if (!refreshed || nextToken === null) {
      const errorBody = await parseApiErrorBody(response);
      throw new ApiClientError(errorBody.statusCode, errorBody.code, errorBody.message);
    }

    response = await fetchWithBearer(url, nextToken);
  }

  if (!response.ok) {
    if (response.status === 401) {
      resetClientState(queryClient);
    }

    const errorBody = await parseApiErrorBody(response);
    throw new ApiClientError(errorBody.statusCode, errorBody.code, errorBody.message);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
