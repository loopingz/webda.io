import { defineConfig, loadEnv } from "vite";

export default defineConfig({
  test: {
    env: loadEnv("test", process.cwd(), ""),
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ["test/**/*.spec.ts"]
  }
});
