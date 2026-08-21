import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // `compiler: true` runs oxc-transform-react, the Rust React Compiler. Next
    // had this on via `reactCompiler` + `turbopackRustReactCompiler`, so this
    // keeps the same behaviour after the move off Next.
    react({ compiler: true }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(here, "src"),
    },
  },
});
