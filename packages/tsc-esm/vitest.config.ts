/// <reference types="vitest" />

import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  test: {
    allowOnly: true,
    coverage: {
      include: ["src/*.ts", "!src/bin.ts"],
      exclude: ["src/*.spec.ts"],
      reporter: ["lcov", "html", "text"]
    },
    reporters: "verbose",
    include: ["src/*.spec.ts"]
  }
});
