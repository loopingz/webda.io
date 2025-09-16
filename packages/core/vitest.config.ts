/// <reference types="vitest" />

import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  test: {
    allowOnly: true,
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/index.ts"],
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
      "src/models/ident.spec.ts",
      "src/models/user.spec.ts",
      "src/services/notificationservice.spec.ts",
      //"src/services/cryptoservice.spec.ts",
      //"src/stores/*.spec.ts",
      "src/loggers/*.spec.ts",
      "src/templates/*.spec.ts",
      "src/errors/*.spec.ts",
      "src/utils/*.spec.ts",
      "src/test/*.spec.ts",
      "src/schemas/*.spec.ts"
      //"src/session/*.spec.ts"
      //"src/**/*.spec.ts"
    ]
  }
});
