import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Builds the hosted dashboard (https://webda.io/debug/) into `dist/hosted/`:
 * `index.html` (the dashboard, with its CSP meta) and its assets. The sandboxed
 * analytics relay (`analytics.html`) is emitted next to it by
 * scripts/build-analytics.mjs. The docs site copies the folder to `static/debug/`.
 */
export default defineConfig({
  root: resolve(root, "hosted"),
  base: "./",
  publicDir: false,
  esbuild: { jsx: "automatic" },
  build: {
    outDir: resolve(root, "dist", "hosted"),
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: { index: resolve(root, "hosted", "index.html") },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
