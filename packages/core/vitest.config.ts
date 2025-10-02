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
      // "src/configurations/*.spec.ts",
      "src/contexts/*.spec.ts",
      "src/core/*.spec.ts",
      "src/errors/*.spec.ts",
      "src/loggers/*.spec.ts",
      "src/models/ident.spec.ts",
      "src/models/user.spec.ts",
      "src/schemas/*.spec.ts",
      //"src/services/authentication.spec.ts", // Need refactor
      "src/services/cloudbinary.spec.ts",
      "src/services/cron.spec.ts",
      "src/services/cryptoservice.spec.ts",
      "src/services/debugmailer.spec.ts",
      //"src/services/domainservice.spec.ts", // Need refactor
      "src/services/mailer.spec.ts",
      "src/services/notificationservice.spec.ts",
      // "src/services/oauth.spec.ts", // Need small refactor
      //"src/services/domainservice.spec.ts", // Need refactor
      //"src/services/prometheus.spec.ts", // Check parameters loading
      // "src/services/resource.spec.ts",
      //"src/services/service.spec.ts",
      //"src/stores/*.spec.ts",
      "src/templates/*.spec.ts",
      "src/test/*.spec.ts",
      "src/utils/*.spec.ts"
    ]
  }
});
