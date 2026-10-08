/// <reference types="vitest" />

import { webdaContentMapper } from "@webda/content-mapper/vite";
import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  plugins: [webdaContentMapper()],
  test: {
    allowOnly: true,
    testTimeout: 20000,
    hookTimeout: 60000,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/index.ts"],
      reporter: ["lcov", "html", "text"]
    },
    passWithNoTests: true,
    setupFiles: ["./vitest.chdir.mts"],
    reporters: "verbose",
    include: [
      "src/bin/*.spec.ts",
      "src/application/*.spec.ts",
      "src/cache/*.spec.ts",
      "src/configurations/*.spec.ts",
      "src/contexts/*.spec.ts",
      "src/core/*.spec.ts",
      "src/deployers/*.spec.ts",
      "src/errors/*.spec.ts",
      "src/loggers/*.spec.ts",
      //"src/models/ownermodel.spec.ts",
      "src/models/ident.spec.ts",
      "src/models/user.spec.ts",
      "src/models/password.spec.ts",
      "src/models/encrypted.spec.ts",
      "src/queues/*.spec.ts",
      //"src/rest/*.spec.ts",
      "src/rest/restoperationstransport.spec.ts",
      "src/rest/rest-behaviors.spec.ts",
      "src/rest/router-prefix.spec.ts",
      "src/schemas/*.spec.ts",
      "src/services/cloudbinary.spec.ts",
      "src/services/cron.spec.ts",
      "src/services/cryptoservice.spec.ts",
      "src/services/debugmailer.spec.ts",
      "src/services/domainservice.spec.ts",
      "src/services/domainservice-behaviors.spec.ts",
      "src/services/domainservice-permissions.spec.ts",
      "src/services/behavior-roundtrip.spec.ts",
      "src/services/binary-behavior.spec.ts",
      "src/services/audit.spec.ts",
      "src/services/audit-read.spec.ts",
      "src/services/operationstransport.spec.ts",
      "src/services/httpserver.spec.ts",
      "src/services/mailer.spec.ts",
      "src/services/notificationservice.spec.ts",
      //"src/services/prometheus.spec.ts", // Check parameters loading
      //"src/services/resource.spec.ts",
      "src/services/resource-unit.spec.ts",
      "src/services/command.spec.ts",
      "src/services/servicecommands.spec.ts",
      "src/services/service.spec.ts",
      "src/services/token.spec.ts",
      "src/services/serviceparameters.spec.ts",
      "src/session/session.spec.ts",
      "src/stores/store.spec.ts",
      "src/stores/memory-separator.spec.ts",
      //"src/stores/*.spec.ts",
      "src/templates/*.spec.ts",
      "src/test/*.spec.ts",
      "src/utils/*.spec.ts",
      "src/test.spec.ts"
    ]
  }
});
