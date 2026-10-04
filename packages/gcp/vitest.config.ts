/// <reference types="vitest" />

import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      "@webda/core/lib/services/binary.spec": resolve(__dirname, "../core/src/services/binary.spec.ts"),
      "@webda/core/lib/queues/queue.spec": resolve(__dirname, "../core/src/queues/queue.spec.ts"),
      "@webda/core/lib/test": resolve(__dirname, "../core/src/test/index.ts")
    }
  },
  test: {
    allowOnly: true,
    testTimeout: 60000,
    hookTimeout: 30000,
    // Emulators, same as the CI (.github/workflows/ci.yml)
    env: {
      GCS_API_ENDPOINT: process.env.GCS_API_ENDPOINT ?? "http://localhost:4443",
      PUBSUB_EMULATOR_HOST: process.env.PUBSUB_EMULATOR_HOST ?? "127.0.0.1:8085",
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8289",
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? resolve(__dirname, "webda-test.json")
    },
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
