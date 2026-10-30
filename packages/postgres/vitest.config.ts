/// <reference types="vitest" />

import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      "@webda/core/lib/test": resolve(__dirname, "../core/src/test/index.ts"),
      "@webda/sql/lib/test": resolve(__dirname, "../sql/src/test/index.ts")
    }
  },
  test: {
    allowOnly: true,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts", "../sql/src/relational/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/**/*.bench.ts", "src/index.ts", "../sql/src/**/*.spec.ts"],
      reporter: ["lcov", "html", "text"]
    },
    reporters: "verbose",
    include: ["src/**/*.spec.ts"]
  }
});
