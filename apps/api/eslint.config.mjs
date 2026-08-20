import { createNestConfig } from '@pulse-chat/eslint-config/nest';

export default [
  ...createNestConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['src/**/*.ts'],
    ignores: ['src/config/**', 'src/test/**', '**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: 'Read configuration through AppConfigService instead of process.env.',
        },
      ],
    },
  },
];
