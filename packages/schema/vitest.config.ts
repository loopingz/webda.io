import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: [
      // Exclude raw vega fixture harness tests for now; we drive integration via schema.test.ts whitelist.
      "test/vega-fixtures/**/*.test.ts"
    ],
    testTimeout: 30000,
    passWithNoTests: false,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "lcov"]
    }
  }
});
