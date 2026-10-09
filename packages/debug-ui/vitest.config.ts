/// <reference types="vitest" />

import { defineConfig } from "vitest/config";

export default defineConfig({
  clearScreen: false,
  esbuild: { jsx: "automatic" },
  test: {
    allowOnly: true,
    environment: "jsdom",
    // Node 25+ ships a global localStorage that shadows jsdom's and is undefined without --localstorage-file
    execArgv: ["--no-experimental-webstorage"],
    testTimeout: 20000,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.spec.ts", "src/**/*.spec.tsx", "src/test/**", "src/index.ts", "src/standalone/**"],
      reporter: ["lcov", "html", "text"]
    },
    reporters: "verbose",
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"]
  }
});
