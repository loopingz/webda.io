/// <reference types="vitest" />

import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      "@webda/core/lib/stores/store.spec": resolve(__dirname, "../core/src/stores/store.spec.ts"),
      "@webda/core/lib/test": resolve(__dirname, "../core/src/test/index.ts"),
      // Route bare @webda/core through src too: StoreTest internals load
      // from source via the alias above, so without this the bare import
      // would resolve to compiled lib and class identities (User, Ident,
      // etc.) would diverge between the two — breaking the Repositories
      // WeakMap lookups in useRepository.
      "@webda/core": resolve(__dirname, "../core/src/index.ts")
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
