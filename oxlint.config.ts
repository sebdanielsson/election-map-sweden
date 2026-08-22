import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["react", "react-perf", "typescript", "unicorn", "oxc", "import", "promise"],
  /* Both run through oxlint-tsgolint (a devDependency): typeAware enables the lint rules
   * that need type information, typeCheck additionally surfaces type errors here. `tsc -b`
   * in the `typecheck` script stays the authority — this is a faster first signal, not a
   * replacement. */
  options: {
    typeAware: true,
    typeCheck: true,
  },
});
