/// <reference types="vitest" />

import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The generated SDK imports "@webda/sdk/client": the tests run it from the sources
const client = fileURLToPath(new URL("./src/client/index.ts", import.meta.url));

export default defineConfig({
  clearScreen: false,
  resolve: {
    // Exact match: the optional entries (`@webda/sdk/client/graphql`...) are imported from their sources directly
    alias: [{ find: /^@webda\/sdk\/client$/, replacement: client }]
  },
  test: {
    allowOnly: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/index.ts", "src/client/index.ts"],
      reporter: ["lcov", "html", "text"]
    },
    reporters: "verbose",
    // graphql-http and graphql-ws must share the ESM build of graphql with @webda/graphql (two builds of graphql
    // refuse each other's schemas: "from another module or realm")
    server: { deps: { inline: [/graphql-http/, /graphql-ws/] } },
    include: ["src/**/*.spec.ts"]
  }
});
