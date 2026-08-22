import { defineConfig } from "oxfmt";

export default defineConfig({
  useTabs: false,
  tabWidth: 2,
  singleQuote: false,
  trailingComma: "all",
  semi: true,
  printWidth: 100,
  sortPackageJson: true,
  /* Point Tailwind class sorting at the v4 entry so it sees this project's own
   * theme, not just the stock utilities. */
  sortTailwindcss: { stylesheet: "src/index.css" },
});
