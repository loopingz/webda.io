import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Builds the shared dashboard (`@webda/debug-ui`) into `webui/`, the folder
 * `DebugService` serves for `webda debug --web --local`.
 *
 * `base: "./"` keeps every asset reference relative, and nothing external is
 * referenced, so the page loads offline.
 */
export default defineConfig({
  root: resolve(root, "webui-src"),
  base: "./",
  publicDir: false,
  build: {
    outDir: resolve(root, "webui"),
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 16384,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
