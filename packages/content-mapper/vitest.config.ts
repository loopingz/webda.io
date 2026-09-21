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
      exclude: ["src/**/*.spec.ts", "src/index.ts"],
      reporter: ["lcov", "html", "text"]
    },
    reporters: "verbose",
    include: ["src/**/*.spec.ts"]
  }
});
