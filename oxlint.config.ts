import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["react", "react-perf", "typescript", "unicorn", "oxc", "import", "promise"],
  ignorePatterns: ["dist/**"],
  /* Type-aware rules run through oxlint-tsgolint (a devDependency); plain type
   * checking stays with `tsc -b` in the `typecheck` script. */
  options: {
    typeAware: true,
    typeCheck: true,
  },
});
