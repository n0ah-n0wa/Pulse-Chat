import { createNestConfig } from '@pulse-chat/eslint-config/nest';

export default [
  ...createNestConfig({
    tsconfigRootDir: import.meta.dirname,
    ignores: ['playwright-report/**', 'test-results/**'],
  }),
  {
    rules: {
      // Node's ProcessEnv is an index signature; bracket access is required by
      // noPropertyAccessFromIndexSignature.
      '@typescript-eslint/dot-notation': 'off',
    },
  },
];
