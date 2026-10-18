/// <reference types="vitest" />

import { defineConfig } from "vite";
import { resolve } from "path";
import { benchVitestOptions } from "@webda/bench/lib/vitest.js";

export default defineConfig({
  clearScreen: false,
  test: {
    ...benchVitestOptions(),
    // Emulators, same as the CI (.github/workflows/ci.yml)
    env: {
      PUBSUB_EMULATOR_HOST: process.env.PUBSUB_EMULATOR_HOST ?? "127.0.0.1:8085",
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8289",
      GOOGLE_APPLICATION_CREDENTIALS:
        process.env.GOOGLE_APPLICATION_CREDENTIALS ?? resolve(__dirname, "webda-test.json")
    }
  }
});
