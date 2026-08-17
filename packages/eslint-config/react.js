import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { createBaseConfig, typescriptFiles } from './base.js';

/**
 * Configuration for the React frontend.
 *
 * @param {{ tsconfigRootDir: string, ignores?: string[] }} options
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createReactConfig({ tsconfigRootDir, ignores = [] }) {
  return tseslint.config(
    createBaseConfig({ tsconfigRootDir, ignores }),
    {
      files: typescriptFiles,
      // `configs.flat` holds the flat-config presets; `configs.recommended` is
      // still published in the legacy eslintrc format.
      extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
      languageOptions: {
        globals: globals.browser,
      },
    },
    {
      // Build tooling pulls @types/node into the program, so Node globals type
      // check inside application code even though they do not exist in a
      // browser. Application sources are held to the browser environment;
      // vite.config.ts and friends are not.
      files: ['src/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-globals': [
          'error',
          {
            name: 'process',
            message: 'Not available in the browser. Use import.meta.env for build-time values.',
          },
          { name: 'Buffer', message: 'Not available in the browser. Use Uint8Array.' },
          { name: '__dirname', message: 'Not available in the browser.' },
          { name: '__filename', message: 'Not available in the browser.' },
          { name: 'global', message: 'Use globalThis.' },
        ],
      },
    },
  );
}
