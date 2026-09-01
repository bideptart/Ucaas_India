import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  /* `backend-patches/` holds patches for the separate backend services, not
     code this app builds: no tsconfig here includes it, so typed linting
     cannot resolve those files and every one of them fails to parse. That
     took `npm run lint` and `npm test` down with six errors while `tsc -b`
     and the build stayed green, because both only ever look at `src`. */
  { ignores: ['dist', 'node_modules', 'connect-web/**', 'backend-patches/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.app.json', './tsconfig.node.json'],
        tsconfigRootDir,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['off'],
      'react-hooks/exhaustive-deps': ['off'],
      '@typescript-eslint/ban-tslint-comment': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      'unused-imports/no-unused-imports': 'error',
    },
  },
);
