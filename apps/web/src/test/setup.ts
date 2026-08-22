import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:test';
}

if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => undefined;
}

// Vitest globals are disabled, so React Testing Library cannot register its own
// automatic cleanup hook.
afterEach(() => {
  cleanup();
});

// Vitest globals are disabled, so React Testing Library cannot register its own
// automatic cleanup hook.
afterEach(() => {
  cleanup();
});
