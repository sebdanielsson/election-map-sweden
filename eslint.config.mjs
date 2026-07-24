import * as espree from 'espree';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  {
    settings: {
      react: { version: '19' }, // Avoids auto-detection crash
    },
  },
  {
    // eslint-config-next defaults JS/MJS/CJS files to next's bundled
    // @babel/eslint-parser, whose scope manager is incompatible with ESLint 10
    // (missing scopeManager.addGlobals). Use ESLint's built-in espree parser
    // for these files instead; TS/TSX still use @typescript-eslint/parser.
    files: ['**/*.{js,mjs,cjs,jsx}'],
    languageOptions: {
      parser: espree,
    },
  },
]);

export default eslintConfig;
