import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const nestSwc = swc.vite({
  module: { type: 'es6' },
  jsc: {
    target: 'es2023',
    parser: { syntax: 'typescript', decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
  },
});

const commonTest = {
  environment: 'node' as const,
  setupFiles: ['reflect-metadata', './src/test/env.ts'],
  restoreMocks: true,
  hookTimeout: 180_000,
  testTimeout: 30_000,
  // mongodb-memory-server cannot start many mongod processes at once on
  // Windows; one worker also lets the shared in-memory URI actually be shared.
  fileParallelism: false,
};

/**
 * HTTP/WebSocket suites that boot Nest and mongodb-memory-server. Everything
 * else is treated as a unit test (specification section 53).
 */
const integrationInclude = [
  'src/**/*.integration.spec.ts',
  'src/**/*.controller.spec.ts',
  'src/**/*.gateway.spec.ts',
  'src/**/*mongoose*.spec.ts',
  'src/**/*.multi-instance.spec.ts',
  'src/bootstrap/bootstrap.spec.ts',
  'src/app.module.spec.ts',
];

function project(name: 'unit' | 'integration', include: string[], exclude?: string[]) {
  return {
    plugins: [nestSwc],
    test: {
      name,
      ...commonTest,
      include,
      exclude,
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      project('unit', ['src/**/*.spec.ts'], integrationInclude),
      project('integration', integrationInclude),
    ],
  },
});
