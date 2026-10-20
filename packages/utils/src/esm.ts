import { realpathSync } from "node:fs";
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

/**
 * Split an import descriptor `file[:exportName]` as found in `webda.module.json`.
 *
 * Only a trailing `:identifier` is treated as the export name, so the colon of a
 * Windows drive letter (`C:\app\lib\my.js:MyService`) is kept within the file.
 *
 * @param descriptor - The import descriptor
 * @returns the file and the export name (`default` when none is specified)
 */
export function parseImportDescriptor(descriptor: string): { file: string; exportName: string } {
  const match = /^(.+):([A-Za-z_$][\w$]*)$/.exec(descriptor);
  if (!match) {
    return { file: descriptor, exportName: "default" };
  }
  return { file: match[1], exportName: match[2] };
}

/**
 * Convert a module path to a specifier accepted by dynamic `import()`.
 *
 * Absolute paths are converted to `file://` URLs: on Windows `import("C:\\...")`
 * fails with `ERR_UNSUPPORTED_ESM_URL_SCHEME`. Other specifiers are returned unchanged.
 *
 * @param file - The module path or specifier
 * @returns a specifier usable with `import()`
 */
export function toImportSpecifier(file: string): string {
  return path.isAbsolute(file) ? url.pathToFileURL(file).href : file;
}

/**
 * Derive the absolute file path of the current module from its `import.meta`.
 *
 * @param importMeta - The `import.meta` object of the calling module
 * @returns The absolute pathname of the current module file
 * @throws {Error} When `importMeta.url` is not available
 */
export function getFileName(importMeta: ImportMeta): string {
  if (typeof importMeta === "object" && typeof importMeta.url === "string") {
    return url.fileURLToPath(importMeta.url);
  }
  throw new Error("Cannot determine file name from importMeta");
}

/**
 * Return `true` if the module identified by `importMeta` is the process entry point.
 *
 * Symbolic links in `process.argv[1]` are resolved before comparison.
 * Always returns `false` in non-Node environments (e.g. browsers).
 *
 * @param importMeta - The `import.meta` object of the calling module
 * @returns `true` when the calling module is the main entry point, `false` otherwise
 */
export function isMainModule(importMeta: ImportMeta): boolean {
  /* v8 ignore next 3 - cannot be tested within a node environment */
  if (typeof process === "undefined") {
    return false;
  }
  const mainModule = process.argv[1];
  // mainModule can be a symbolic link so we need to resolve it
  const realPath = realpathSync(mainModule);
  // @ts-ignore
  return importMeta.url === (typeof process !== "undefined" ? `file://${realPath}` : undefined);
}
