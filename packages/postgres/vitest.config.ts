/// <reference types="vitest" />

import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      "@webda/core/lib/stores/store.spec": resolve(__dirname, "../core/src/stores/store.spec.ts"),
      "@webda/core/lib/test": resolve(__dirname, "../core/src/test/index.ts"),
      // Route bare @webda/core and @webda/models through src too: StoreTest
      // internals (and the test's own imports) load from source via the
      // aliases above, so without this the bare imports would resolve to
      // compiled lib and class identities (User, Ident, etc.) plus the
      // Repositories WeakMap (which lives in @webda/models) would diverge
      // between the two — breaking useRepository lookups.
      "@webda/core": resolve(__dirname, "../core/src/index.ts"),
      "@webda/models": resolve(__dirname, "../models/src/index.ts")
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
