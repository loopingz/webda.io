import { defineConfig } from "vite";
import { webdaContentMapper } from "@webda/content-mapper/vite";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const libDir = resolve(root, "lib");

/**
 * The module descriptor (webda.module.json) points at `lib/*.js`: redirect this package's own compiled
 * files to their `src/*.ts` so that the specs execute (and coverage measures) the sources
 */
const libToSrc = {
  name: "auth-lib-to-src",
  enforce: "pre" as const,
  async resolveId(this: any, source: string, importer?: string, options?: any) {
    let file: string | undefined;
    if (source.startsWith("file://")) {
      file = fileURLToPath(source);
    } else if (source.startsWith("/") || source.startsWith(".")) {
      file = resolve(importer ? dirname(importer) : root, source);
    }
    if (!file || !file.startsWith(libDir + "/")) {
      return null;
    }
    const src = resolve(root, "src", file.slice(libDir.length + 1).replace(/\.[cm]?js$/, "") + ".ts");
    return existsSync(src) ? src : null;
  }
};

export default defineConfig({
  clearScreen: false,
  plugins: [libToSrc, webdaContentMapper()],
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
