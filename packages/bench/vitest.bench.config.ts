/// <reference types="vitest" />

import { defineConfig } from "vite";
import { benchVitestOptions } from "./src/vitest.js";

export default defineConfig({
  clearScreen: false,
  test: benchVitestOptions()
});
