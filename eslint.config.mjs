// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist'],
  },
  {
    files: ['src/**/*.{js,ts,jsx,tsx}'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
];
