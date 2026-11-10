import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    // Hashed output lives in dist/build (immutable cache). public/assets is copied unhashed.
    assetsDir: 'build',
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
  },
  server: { host: true },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
  },
});
