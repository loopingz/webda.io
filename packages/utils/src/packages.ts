/**
 * A `@webda/*` package loaded in the current process
 */
export interface WebdaPackageInfo {
  /**
   * Package name
   */
  name: string;
  /**
   * URL of the entry that registered the package (`import.meta.url`)
   */
  url: string;
  /**
   * Version given at registration: when omitted, the error message reads it from the package.json
   */
  version?: string;
}

/**
 * Key of the registry on `globalThis`
 *
 * `Symbol.for` returns the same symbol for every copy of `@webda/utils`, so even a
 * duplicated `@webda/utils` shares the registry
 */
const REGISTRY = Symbol.for("webda.packages");

/**
 * Environment variable that downgrades a duplicate package from an error to a logged error
 */
const WEBDA_ALLOW_DUPLICATE_PACKAGES = "WEBDA_ALLOW_DUPLICATE_PACKAGES";

/**
 * Get the shared registry, creating it on first use
 * @returns the registry
 */
function getRegistry(): Map<string, WebdaPackageInfo> {
  const sharedGlobal = globalThis as typeof globalThis & { [REGISTRY]?: Map<string, WebdaPackageInfo> };
  return (sharedGlobal[REGISTRY] ??= new Map<string, WebdaPackageInfo>());
}

/**
 * Get the `@webda/*` packages loaded in the current process
 * @returns the packages by name
 */
export function getWebdaPackages(): ReadonlyMap<string, WebdaPackageInfo> {
  return getRegistry();
}

/**
 * Convert a module URL to a path for messages, the URL itself if it is not a file
 * @param url - module URL
 * @returns the readable location
 */
function toLocation(url: string): string {
  try {
    return globalThis.process?.getBuiltinModule?.("node:url")?.fileURLToPath(url) ?? url;
  } catch {
    return url;
  }
}

/**
 * Read the version of the package containing `url`, from its nearest package.json
 *
 * Only used to build the error message: it is not available in browsers
 * @param name - package name, to skip nested package.json of other packages
 * @param url - module URL
 * @returns the version or "unknown"
 */
function readVersion(name: string, url: string): string {
  try {
    const fs = globalThis.process?.getBuiltinModule?.("node:fs");
    const path = globalThis.process?.getBuiltinModule?.("node:path");
    if (!fs || !path || !url.startsWith("file:")) {
      return "unknown";
    }
    let dir = path.dirname(toLocation(url));
    while (dir !== path.dirname(dir)) {
      const file = path.join(dir, "package.json");
      if (fs.existsSync(file)) {
        const pkg = JSON.parse(fs.readFileSync(file, "utf-8"));
        if (pkg.name === name) {
          return pkg.version ?? "unknown";
        }
      }
      dir = path.dirname(dir);
    }
  } catch {
    // The version is informative only
  }
  return "unknown";
}

/**
 * Register a `@webda/*` package, called from the entry of each package
 *
 * Webda relies on a single instance of each package: classes are used as keys
 * (repositories) or matched with `instanceof` (WebdaQL expressions), so a second copy
 * of a package breaks later in ways that do not point at the cause. Loading the same
 * package from two different paths throws, even when both copies have the same version.
 *
 * Evaluating the same path again (test runners reloading modules) is allowed.
 * Set `WEBDA_ALLOW_DUPLICATE_PACKAGES=1` to log an error instead of throwing.
 *
 * @param name - package name
 * @param url - `import.meta.url` of the package entry
 * @param version - package version, read from the package.json when needed if omitted
 * @throws Error if the package is already registered from a different path
 */
export function registerWebdaPackage(name: string, url: string, version?: string): void {
  const registry = getRegistry();
  const current = registry.get(name);
  if (!current) {
    registry.set(name, { name, url, version });
    return;
  }
  // Compare paths, not versions: the same version can be installed twice
  if (current.url === url) {
    return;
  }
  const message =
    `${name} loaded twice: ${toLocation(current.url)} (${current.version ?? readVersion(name, current.url)}) and ` +
    `${toLocation(url)} (${version ?? readVersion(name, url)}). Webda needs a single instance of each package: ` +
    `dedupe your install (pnpm: a missing direct dependency or an override on a peer)`;
  if (globalThis.process?.env?.[WEBDA_ALLOW_DUPLICATE_PACKAGES] === "1") {
    // The logger may not be configured yet at import time
    console.error(`ERROR: ${message}`);
    return;
  }
  throw new Error(message);
}

registerWebdaPackage("@webda/utils", import.meta.url);
