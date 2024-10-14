/// <reference types="vitest" />

import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  test: {
    allowOnly: true,
    coverage: {
      include: ["src/*.ts"],
      exclude: ["src/*.spec.ts"],
      reporter: ["lcov", "html", "text"]
    },
    setupFiles: ["./vitest.chdir.mts"],
    reporters: "verbose",
    include: ["src/*.spec.ts"]
  }
});
