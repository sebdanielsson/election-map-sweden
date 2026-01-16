/** @type {import('stylelint').Config} */
const config = {
  extends: [
    'stylelint-config-standard',
    'stylelint-config-html/html',
    '@dreamsicle.io/stylelint-config-tailwindcss',
  ],
  rules: {
    'color-hex-length': null,
  },
};

export default config;
