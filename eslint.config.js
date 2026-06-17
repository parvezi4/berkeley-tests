import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'load-tests/results/**',
      '*.config.js',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-console': [
        'warn',
        {
          allow: ['warn', 'error'],
        },
      ],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['**/*.spec.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
