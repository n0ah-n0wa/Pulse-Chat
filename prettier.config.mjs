/** @type {import("prettier").Config} */
const config = {
  printWidth: 100,
  tabWidth: 2,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  arrowParens: 'always',
  bracketSpacing: true,
  endOfLine: 'lf',
  overrides: [
    {
      files: ['*.md', '*.yml', '*.yaml'],
      options: {
        printWidth: 80,
      },
    },
  ],
};

export default config;
