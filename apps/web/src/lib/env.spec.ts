import { describe, expect, it } from 'vitest';

import { getApiBaseUrl, getWebSocketPath, getWebSocketUrl } from './env';

describe('env', () => {
  it('defaults API and websocket settings to same-origin values', () => {
    expect(getApiBaseUrl()).toBe('');
    expect(getWebSocketUrl()).toBe(globalThis.location.origin);
    expect(getWebSocketPath()).toBe('/socket.io');
  });
});
