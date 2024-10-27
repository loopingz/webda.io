/// <reference types="vitest" />

import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  test: {
    allowOnly: true,
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts"],
      reporter: ["lcov", "html", "text"]
    },
    testTransformMode: {
      web: ["./esbuild.webda.ts"]
    },
    setupFiles: ["./vitest.chdir.mts"],
    reporters: "verbose",
    include: [
      "src/application/*.spec.ts",
      "src/cache/*.spec.ts",
      "src/contexts/*.spec.ts",
      "src/errors/*.spec.ts",
      "src/models/*.spec.ts",
      "src/services/cryptoservice.spec.ts",
      "src/stores/memory.spec.ts",
      "src/loggers/*.spec.ts",
      "src/errors/*.spec.ts",
      "src/utils/*.spec.ts",
      "src/test/*.spec.ts"
    ]
  }
});
