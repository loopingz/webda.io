/// <reference types="vitest" />

import { defineConfig, normalizePath } from "vite";
import { resolve } from "path";

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      "@webda/core/lib/test": resolve(__dirname, "../core/src/test/index.ts"),
      "@webda/sql/lib/test": resolve(__dirname, "../sql/src/test/index.ts"),
      "@webda/sql": resolve(__dirname, "../sql/src/index.ts")
    }
  },
  test: {
    allowOnly: true,
    coverage: {
      enabled: true,
      provider: "v8",
      allowExternal: true,
      include: [
        normalizePath(resolve(__dirname, "src/**/*.ts")),
        normalizePath(resolve(__dirname, "../sql/src/**/*.ts"))
      ],
      exclude: ["**/*.spec.ts", "**/*.bench.ts", "**/src/index.ts", "**/src/test/**"],
      reporter: ["lcov", "html", "text"]
    },
    reporters: "verbose",
    include: ["src/**/*.spec.ts"]
  }
});
