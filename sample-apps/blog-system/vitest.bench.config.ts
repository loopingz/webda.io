/// <reference types="vitest" />

import { defineConfig } from "vite";
import { benchVitestOptions } from "@webda/bench/lib/vitest.js";

export default defineConfig({
  clearScreen: false,
  test: benchVitestOptions({ include: ["bench/**/*.bench.ts"] })
});
