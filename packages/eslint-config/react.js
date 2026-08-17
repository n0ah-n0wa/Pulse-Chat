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
  return tseslint.config(createBaseConfig({ tsconfigRootDir, ignores }), {
    files: typescriptFiles,
    // `configs.flat` holds the flat-config presets; `configs.recommended` is
    // still published in the legacy eslintrc format.
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
  });
}
