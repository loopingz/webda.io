import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: [
      // Exclude raw vega fixture harness tests for now; we drive integration via schema.test.ts whitelist.
      'test/vega-fixtures/**/*.test.ts'
    ],
    passWithNoTests: false,
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
