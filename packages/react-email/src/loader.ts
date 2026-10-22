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
 * Resolve the module to import, preferring a compiled one when a source map matches
 *
 * @param path - path of the email source, relative to `process.cwd()` (or absolute)
 * @param sourceMap - source prefix to compiled prefix map; the first matching prefix is replaced
 * and `.tsx`/`.jsx` becomes `.js`
 * @returns the mapped absolute path if that file exists, else `path` unchanged
 */
export function resolveModulePath(path: string, sourceMap?: Record<string, string>): string {
  if (!sourceMap) {
    return path;
  }
  const rel = relative(process.cwd(), resolve(path)).split("\\").join("/");
  for (const [from, to] of Object.entries(sourceMap)) {
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
  let mod: any;
  try {
    mod = await loader.importModule(`${pathToFileURL(resolved).href}?t=${String(mtime).replace(".", "_")}`);
  } catch (err: any) {
    if (err?.code === "ERR_UNKNOWN_FILE_EXTENSION") {
      throw new Error(
        `Cannot import '${resolved}': TypeScript/JSX sources are not loadable at runtime. ` +
          "Compile the emails and set the 'sourceMap' parameter to map the sources to the compiled files",
        { cause: err }
      );
    }
    throw err;
  }
  if (typeof mod?.default !== "function") {
    throw new NoDefaultExportError(resolved);
  }
  component = mod.default as EmailComponent;
  cache.set(key, component);
  return component;
}
