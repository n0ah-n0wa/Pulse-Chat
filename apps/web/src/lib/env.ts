const DEFAULT_API_BASE_URL = '';
const DEFAULT_WS_PATH = '/socket.io';

function readEnvString(key: keyof ImportMetaEnv): string | undefined {
  const value: unknown = import.meta.env[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** REST API origin or prefix. Defaults to same-origin relative `/api` paths. */
export function getApiBaseUrl(): string {
  return readEnvString('VITE_API_BASE_URL') ?? DEFAULT_API_BASE_URL;
}

/** Socket.IO server URL. Defaults to the current page origin. */
export function getWebSocketUrl(): string {
  return readEnvString('VITE_WS_URL') ?? globalThis.location.origin;
}

/** Socket.IO HTTP path (proxied by nginx in development and production). */
export function getWebSocketPath(): string {
  return DEFAULT_WS_PATH;
}
