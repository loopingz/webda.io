/// <reference types="vitest" />

import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  test: {
    reporters: "verbose",
    include: ["src/**/*.spec.ts"]
  }
});
