/// <reference types="vitest" />

import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      "@webda/core/lib/test": resolve(__dirname, "../core/src/test/index.ts"),
      // store.spec.ts is now compiled to lib via tsconfig files[], but
      // @webda/core has no exports field so Node ESM strict resolution
      // refuses bare subpath imports. Aliasing to the lib file lets
      // vitest find it; importantly we point to LIB (not src) so class
      // identities match what Application.load resolves at runtime.
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
