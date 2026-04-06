/// <reference types="vitest" />

import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  test: {
    allowOnly: true,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts"],
      reporter: ["lcov", "html", "text"]
    },
    testTimeout: 30000,
    reporters: "verbose",
    include: ["src/**/*.spec.ts"]
  }
});
