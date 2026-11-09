/// <reference types="vitest" />

import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  clearScreen: false,
  resolve: {
    // Exact match: the files under @webda/core/lib/test keep their own path
    alias: [{ find: /^@webda\/core\/lib\/test$/, replacement: resolve(__dirname, "../core/src/test/index.ts") }]
  },
  test: {
    allowOnly: true,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.spec.ts",
        "src/index.ts",
        "src/models/filters/index.ts",
        "src/models/filters/interfaces.ts",
        "src/models/filters/logical.ts",
        "src/models/filters/types.ts",
        "src/models/filters/sql/CESQL*.ts"
      ],
      reporter: ["lcov", "html", "text"]
    },
    setupFiles: ["./test/setup.ts"],
    reporters: "verbose",
    include: ["src/**/*.spec.ts"]
  }
});
