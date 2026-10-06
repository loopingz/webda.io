import { defineConfig } from "vite";
import { webdaContentMapper } from "@webda/content-mapper/vite";

export default defineConfig({
  clearScreen: false,
  plugins: [webdaContentMapper()],
  test: {
    allowOnly: true,
    testTimeout: 20000,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/index.ts", "src/test/**"],
      reporter: ["lcov", "html", "text"]
    },
    reporters: "verbose",
    include: ["src/**/*.spec.ts"]
  }
});
