/// <reference types="vitest" />

import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The generated SDK imports "@webda/sdk/client": the tests run it from the sources
const client = fileURLToPath(new URL("./src/client/index.ts", import.meta.url));

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      "@webda/sdk/client": client
    }
  },
  test: {
    allowOnly: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/index.ts", "src/client/index.ts"],
      reporter: ["lcov", "html", "text"]
    },
    reporters: "verbose",
    include: ["src/**/*.spec.ts"]
  }
});
