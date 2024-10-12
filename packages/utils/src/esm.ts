import * as path from "path";
import * as url from "url";

/**
 * Get commonjs info __filename and __dirname
 * @param urlInfo
 * @returns
 * @example
 * ```ts
 * const { __filename, __dirname } = getCommonJS(import.meta.url);
 * ```
 */
export function getCommonJS(urlInfo: string) {
  const __filename = url.fileURLToPath(urlInfo);
  return {
    __dirname: path.dirname(__filename),
    __filename
  };
}
