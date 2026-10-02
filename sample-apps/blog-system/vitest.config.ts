import { defineConfig } from "vite";

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ["test/**/*.ts"],
    // Playwright specs run through `pnpm test:e2e`
    exclude: ["test/e2e/**", "node_modules/**"]
  }
});
