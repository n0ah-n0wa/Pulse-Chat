import tseslint from 'typescript-eslint';

import { createBaseConfig } from './base.js';

/**
 * Globals that only exist in Node. Shared code runs in the browser too.
 */
const nodeOnlyGlobals = [
  { name: 'process', message: 'Shared code runs in the browser; pass configuration in instead.' },
  { name: 'Buffer', message: 'Shared code runs in the browser; use Uint8Array.' },
  { name: '__dirname', message: 'Shared code runs in the browser and has no filesystem.' },
  { name: '__filename', message: 'Shared code runs in the browser and has no filesystem.' },
  { name: 'global', message: 'Use globalThis if a global is genuinely required.' },
  { name: 'setImmediate', message: 'Not available in the browser; use setTimeout.' },
];

/**
 * Globals that only exist in browsers. Shared code runs on the server too.
 */
const browserOnlyGlobals = [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
].map((name) => ({
  name,
  message: 'Shared code runs on the server; keep browser APIs in apps/web.',
}));

/**
 * Configuration for platform-neutral packages such as @pulse-chat/shared.
 *
 * The tsconfig for these packages sets `"types": []` and omits the DOM library,
 * so most violations are already compile errors. These rules cover the rest and
 * explain what to do instead.
 *
 * @param {{ tsconfigRootDir: string, ignores?: string[] }} options
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createLibraryConfig({ tsconfigRootDir, ignores = [] }) {
  return tseslint.config(createBaseConfig({ tsconfigRootDir, ignores }), {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...nodeOnlyGlobals, ...browserOnlyGlobals],
    },
  });
}
