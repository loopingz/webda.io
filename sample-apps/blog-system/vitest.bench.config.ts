/// <reference types="vitest" />

import { defineConfig } from "vite";
import { benchVitestOptions } from "@webda/bench/lib/vitest.js";

export default defineConfig({
  clearScreen: false,
  test: {
    ...benchVitestOptions({ include: ["bench/**/*.bench.ts"] }),
    server: {
      deps: {
        // Vite resolves `graphql` to its ESM build for @webda/graphql (a workspace package it transforms) while Node
        // loads the CommonJS build for graphql-http: two realms ("Cannot use GraphQLSchema from another module").
        // Inline them so every import resolves the same build, as in a plain Node process.
        inline: ["graphql-http", "graphql-ws"]
      }
    }
  }
});
