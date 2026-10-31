/// <reference types="vitest" />

import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  test: {
    allowOnly: true,
    // WebCrypto and fake-indexeddb run in Node
    environment: "node",
    // Argon2id (64 MiB, t=3) runs several times per test
    testTimeout: 60000,
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
