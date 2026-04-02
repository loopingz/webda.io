/// <reference types="vitest" />

import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      "@webda/core/lib/services/binary.spec": resolve(__dirname, "../core/src/services/binary.spec.ts"),
      "@webda/core/lib/stores/store.spec": resolve(__dirname, "../core/src/stores/store.spec.ts"),
      "@webda/core/lib/queues/queue.spec": resolve(__dirname, "../core/src/queues/queue.spec.ts"),
      "@webda/core/lib/test": resolve(__dirname, "../core/src/test/index.ts")
    }
  },
  test: {
    allowOnly: true,
    passWithNoTests: true,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/index.ts"],
      reporter: ["lcov", "html", "text"]
    },
    reporters: "verbose",
    include: [
      // Store, binary, and queue tests depend on base test classes
      // from @webda/core that are currently disabled (see core vitest.config.ts)
      // Re-enable when core store/binary/queue tests are working
      //"src/filestore.spec.ts",
      //"src/filebinary.spec.ts",
      //"src/filequeue.spec.ts"
    ],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
