import { resolve } from "node:path";
import type { Plugin } from "vite";
import { WarmSession } from "./session.ts";

/** Options for {@link webdaContentMapper} */
export interface WebdaContentMapperOptions {
  /** tsconfig used to build the resident program, relative to the vite root (default "tsconfig.json") */
  tsconfig?: string;
  /** Files to transform (default: `.ts` files outside node_modules, not `.d.ts`) */
  include?: RegExp;
}

/**
 * Vite/Vitest plugin applying Webda's content-mapper generators (behaviors,
 * accessors, load parameters, WebdaQL validators) to TypeScript sources, so
 * specs exercise the same code `webdac build` emits.
 *
 * Files excluded from the tsconfig (typically `*.spec.ts`) are not part of the
 * resident program and pass through unchanged.
 * @param options - plugin options
 * @returns the vite plugin
 */
export function webdaContentMapper(options: WebdaContentMapperOptions = {}): Plugin {
  const include = options.include ?? /^(?!.*node_modules).*(?<!\.d)\.ts$/;
  let session: WarmSession | undefined;
  let root = process.cwd();
  return {
    name: "webda-content-mapper",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
    },
    transform(code, id) {
      const file = id.split("?")[0];
      if (!include.test(file)) {
        return undefined;
      }
      session ??= new WarmSession({ configFile: resolve(root, options.tsconfig ?? "tsconfig.json"), cwd: root });
      const outcome = session.transform(file, code);
      if (!outcome.editCount) {
        return undefined;
      }
      return { code: outcome.text, map: null };
    },
    buildEnd() {
      session?.dispose();
      session = undefined;
    }
  };
}
