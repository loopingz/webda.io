import { defineConfig } from "vite";

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ["test/**/*.ts"]
  }
});
