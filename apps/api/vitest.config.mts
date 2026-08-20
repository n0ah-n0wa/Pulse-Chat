import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Nest's dependency injection reads `design:paramtypes` metadata. Vitest's
  // default esbuild transform cannot emit it, so SWC compiles the sources.
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata', './src/test/env.ts'],
    restoreMocks: true,
    hookTimeout: 180_000,
    testTimeout: 30_000,
    // mongodb-memory-server cannot start many mongod processes at once on
    // Windows; one worker also lets the shared in-memory URI actually be shared.
    fileParallelism: false,
  },
});
