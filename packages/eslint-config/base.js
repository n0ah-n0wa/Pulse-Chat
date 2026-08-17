import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

/**
 * Paths that are never linted, in any package.
 */
export const sharedIgnores = ['**/dist/**', '**/coverage/**', '**/.turbo/**'];

/**
 * Every extension the TypeScript rules apply to. `.mts` covers ESM-only
 * tooling configuration such as vitest.config.mts.
 */
export const typescriptFiles = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];

/**
 * Base configuration shared by every TypeScript package in the workspace.
 *
 * Type-aware rules are enabled, which requires each consumer to pass the
 * directory holding its own `tsconfig.json` as `tsconfigRootDir`. Plain
 * JavaScript files (tooling configs) stay outside the TypeScript program.
 *
 * @param {{ tsconfigRootDir: string, ignores?: string[] }} options
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createBaseConfig({ tsconfigRootDir, ignores = [] }) {
  return tseslint.config(
    { ignores: [...sharedIgnores, ...ignores] },
    js.configs.recommended,
    {
      files: typescriptFiles,
      extends: [tseslint.configs.recommendedTypeChecked, tseslint.configs.stylisticTypeChecked],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        // The specification bans `any` unless there is a documented reason.
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            args: 'all',
            argsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
          },
        ],
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        eqeqeq: ['error', 'always', { null: 'ignore' }],
        'no-console': 'warn',
      },
    },
    // Prettier owns formatting; disable rules that would fight it.
    prettierConfig,
  );
}
