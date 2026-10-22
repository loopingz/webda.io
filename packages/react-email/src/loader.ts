import { useLog } from "@webda/core";
import { existsSync, statSync } from "fs";
import { relative, resolve } from "path";
import { pathToFileURL } from "url";
import type { ReactNode } from "react";

/**
 * A react-email component module default export
 */
export type EmailComponent = ((props: any) => ReactNode) & {
  Subject?: string | ((props: any) => string);
  PreviewProps?: Record<string, any>;
  Text?: (props: any) => string;
};

/**
 * Wrapper around the dynamic import so it can be spied on in tests
 * (ESM named exports cannot be spied on).
 */
export const loader = {
  /**
   * Import a module
   * @param url - file URL to import
   * @returns the module namespace
   */
  importModule(url: string): Promise<any> {
    return import(url);
  },
  /**
   * Import a TypeScript/JSX module with the optional `tsx` peer dependency
   *
   * tsx compiles JSX with the classic runtime unless the module is covered by a tsconfig with `"jsx": "react-jsx"`,
   * so `React` is made global, as the react-email scripts do.
   * @param url - file URL to import
   * @returns the module namespace
   */
  async importTsx(url: string): Promise<any> {
    const { tsImport } = await import("tsx/esm/api");
    (globalThis as any).React ??= (await import("react")).default;
    return tsImport(url, import.meta.url);
  }
};

const cache = new Map<string, EmailComponent>();

/**
 * Thrown when an email module has no default export component (a helper module)
 */
export class NoDefaultExportError extends Error {
  /**
   * @param path - path of the module
   */
  constructor(public path: string) {
    super(`Email module '${path}' has no default export component`);
    this.name = "NoDefaultExportError";
  }
}

/**
 * Normalize a source map prefix: no leading `./`, a trailing `/`
 * @param prefix - the prefix
 * @returns the normalized prefix
 */
function normalizePrefix(prefix: string): string {
  const normalized = prefix
    .split("\\")
    .join("/")
    .replace(/^(\.\/)+/, "");
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

/**
 * Resolve the module to import, preferring a compiled one when a source map matches
 *
 * @param path - path of the email source, relative to `process.cwd()` (or absolute)
 * @param sourceMap - source prefix to compiled prefix map, relative to `process.cwd()` (`./emails` and `emails/` are
 * the same prefix); the first matching prefix is replaced and `.tsx`/`.jsx` becomes `.js`
 * @returns the mapped absolute path if that file exists, else `path` unchanged
 */
export function resolveModulePath(path: string, sourceMap?: Record<string, string>): string {
  if (!sourceMap) {
    return path;
  }
  const rel = relative(process.cwd(), resolve(path)).split("\\").join("/");
  for (const [rawFrom, rawTo] of Object.entries(sourceMap)) {
    const from = normalizePrefix(rawFrom);
    const to = normalizePrefix(rawTo);
    if (rel.startsWith(from)) {
      const mapped = resolve(to + rel.substring(from.length)).replace(/\.[tj]sx$/, ".js");
      if (existsSync(mapped)) {
        useLog("DEBUG", `react-email: using compiled module ${mapped} for ${path}`);
        return mapped;
      }
      break;
    }
  }
  return path;
}

/**
 * Import the default export of an email module
 *
 * The module is cached by path and modification time: the parts of one file share a single import
 * and an edited file is reloaded.
 *
 * @param path - path of the email module
 * @param sourceMap - optional source to compiled prefix map, see {@link resolveModulePath}
 * @returns the email component
 */
export async function importEmail(path: string, sourceMap?: Record<string, string>): Promise<EmailComponent> {
  const resolved = resolveModulePath(path, sourceMap);
  const mtime = statSync(resolved).mtimeMs;
  const key = `${resolved}|${mtime}`;
  let component = cache.get(key);
  if (component) {
    return component;
  }
  const url = `${pathToFileURL(resolved).href}?t=${String(mtime).replace(".", "_")}`;
  let mod: any;
  try {
    mod = await loader.importModule(url);
  } catch (err: any) {
    if (err?.code !== "ERR_UNKNOWN_FILE_EXTENSION") {
      throw err;
    }
    // Plain node cannot import .tsx/.jsx: fall back to tsx when it is installed
    try {
      mod = await loader.importTsx(url);
    } catch (tsxErr: any) {
      if (tsxErr?.code !== "ERR_MODULE_NOT_FOUND" || !String(tsxErr?.message).includes("tsx")) {
        throw tsxErr;
      }
      throw new Error(
        `Cannot import '${resolved}': TypeScript/JSX sources are not loadable at runtime. ` +
          "Install 'tsx' to load them, or compile the emails and set the 'sourceMap' parameter " +
          "to map the sources to the compiled files",
        { cause: err }
      );
    }
  }
  if (typeof mod?.default !== "function") {
    throw new NoDefaultExportError(resolved);
  }
  component = mod.default as EmailComponent;
  cache.set(key, component);
  return component;
}
