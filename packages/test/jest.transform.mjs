import { transformSync } from "esbuild";

/**
 * Jest transform for the TypeScript specs.
 *
 * ts-jest drives the classic compiler API, which TypeScript 7 removed, so it
 * cannot load the TypeScript this package builds with. esbuild strips types
 * and lowers standard decorators without it; type checking is `tsc`'s job.
 */
export default {
  process(source, filename) {
    const { code, map } = transformSync(source, {
      loader: "ts",
      format: "esm",
      target: "es2022",
      sourcefile: filename,
      sourcemap: "inline"
    });
    return { code, map };
  }
};
