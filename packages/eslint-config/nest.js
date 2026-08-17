import globals from 'globals';
import tseslint from 'typescript-eslint';

import { createBaseConfig, typescriptFiles } from './base.js';

/**
 * Configuration for the NestJS backend.
 *
 * @param {{ tsconfigRootDir: string, ignores?: string[] }} options
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createNestConfig({ tsconfigRootDir, ignores = [] }) {
  return tseslint.config(createBaseConfig({ tsconfigRootDir, ignores }), {
    files: typescriptFiles,
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Nest resolves constructor dependencies from `design:paramtypes` metadata.
      // Rewriting those imports to `import type` erases the metadata and breaks
      // dependency injection at runtime, so value imports must be preserved.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  });
}
