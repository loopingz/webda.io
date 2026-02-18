import * as path from "node:path";
import * as url from "node:url";

/**
 * Get CommonJS-style `__filename` and `__dirname` equivalents for ESM modules.
 *
 * @param urlInfo - The `import.meta.url` of the calling module
 * @returns An object containing `__filename` (absolute file path) and `__dirname` (directory path)
 * @example
 * ```ts
 * const { __filename, __dirname } = getCommonJS(import.meta.url);
 * ```
 */
export function getCommonJS(urlInfo: string) {
  const __filename = url.fileURLToPath(urlInfo);
  return { __dirname: path.dirname(__filename), __filename };
}
