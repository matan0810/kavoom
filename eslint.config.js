// Lint rules: catch real mistakes (unused variables, missing hook dependencies,
// undefined names). Formatting is Prettier's job, not ESLint's.

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // The browser side: React components and the engine they drive.
    files: ['src/**/*.{js,jsx}'],
    ...react.configs.flat.recommended,
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { ...react.configs.flat.recommended.plugins, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react/prop-types': 'off', // no TypeScript or PropTypes in this project
    },
  },
  { files: ['public/sw.js'], languageOptions: { globals: globals.serviceworker } },
  {
    // Shared by browser and server: must not reach for either one's globals.
    files: ['shared/**/*.js'],
    languageOptions: { globals: {} },
  },
  {
    files: ['server/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.{js,cjs}', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['tests/e2e/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
];
