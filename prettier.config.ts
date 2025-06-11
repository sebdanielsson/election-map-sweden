import { type Config } from 'prettier';

const config: Config = {
  plugins: ['prettier-plugin-tailwindcss'],
  useTabs: false,
  tabWidth: 2,
  singleQuote: true,
  trailingComma: 'all',
  semi: true,
  printWidth: 100,
};

export default config;
