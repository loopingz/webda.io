/// <reference types="vitest" />

import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      "@webda/core/lib/test": resolve(__dirname, "../core/src/test/index.ts"),
      // store.spec.ts is compiled to lib (via tsconfig files[]) for cross-
      // package use, but @webda/core has no exports field so Node ESM
      // strict resolution refuses the subpath. Aliasing it to the lib
      // file (NOT to src — src would re-introduce the class-identity
      // mismatch we just resolved) lets vitest find it.
      "@webda/core/lib/stores/store.spec": resolve(__dirname, "../core/lib/stores/store.spec.js")
    }
  },
  test: {
    allowOnly: true,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/index.ts"],
      reporter: ["lcov", "html", "text"]
    },
    reporters: "verbose",
    include: ["src/**/*.spec.ts"]
  }
});
