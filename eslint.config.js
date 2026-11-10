import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'public'] },
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
    files: ['scripts/**', 'tests/**', '*.config.*'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly', fetch: 'readonly', setTimeout: 'readonly', window: 'readonly', document: 'readonly', performance: 'readonly' } },
    rules: { 'no-console': 'off' },
  },
);
