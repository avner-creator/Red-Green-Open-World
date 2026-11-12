import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // QA round drivers (scripts/qa4, qa4c, qa5): step snippets run inside a driver with injected
  // globals (page, H, log) and page code; they are throwaway QA tooling, not linted.
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'public', 'scripts/qa4/**', 'scripts/qa4c/**', 'scripts/qa5/**', 'scripts/qa6/**', 'scripts/qa7/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['scripts/**', 'tests/**', '*.config.*', 'tools/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly', fetch: 'readonly', setTimeout: 'readonly', window: 'readonly', document: 'readonly', performance: 'readonly' } },
    rules: { 'no-console': 'off' },
  },
  {
    // Offline asset build tools (Node scripts; some run snippets in a headless browser).
    files: ['tools/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: { Buffer: 'readonly', __dirname: 'readonly', navigator: 'readonly', Blob: 'readonly', FileReader: 'readonly', setInterval: 'readonly', clearTimeout: 'readonly', clearInterval: 'readonly', TextDecoder: 'readonly', TextEncoder: 'readonly', URLSearchParams: 'readonly' } },
  },
);
