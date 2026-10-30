/// <reference types="vitest" />

import { defineConfig, normalizePath } from "vite";
import { resolve } from "path";

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      "@webda/core/lib/test": resolve(__dirname, "../core/src/test/index.ts"),
      "@webda/sql/lib/test": resolve(__dirname, "../sql/src/test/index.ts"),
      // The relational layer of @webda/sql is measured by this suite (the sqlite suite measures the JSON layer)
      "@webda/sql": resolve(__dirname, "../sql/src/index.ts")
    }
  },
  test: {
    allowOnly: true,
    // Every suite shares one database: the relational suites drop and recreate the same tables
    fileParallelism: false,
    coverage: {
      enabled: true,
      provider: "v8",
      allowExternal: true,
      include: [
        normalizePath(resolve(__dirname, "src/**/*.ts")),
        normalizePath(resolve(__dirname, "../sql/src/relational/**/*.ts"))
      ],
      exclude: ["**/*.spec.ts", "**/*.bench.ts", "**/src/index.ts", "**/src/relational/index.ts", "**/src/test/**"],
      reporter: ["lcov", "html", "text"]
    },
    reporters: "verbose",
    include: ["src/**/*.spec.ts"]
  }
});
