import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type VersionResolver = (name: string) => string | undefined;

/** Tool versions taken from @webda/core devDependencies so apps build like the monorepo */
export const EXTERNAL_TOOLS = ["typescript", "vite", "vitest", "sinon", "@types/node"];

/**
 * Replace template versions (`workspace:*` for @webda packages, `managed` for tools)
 * @param pkg - package.json content, mutated
 * @param resolve - version lookup
 */
export function applyVersions(pkg: Record<string, any>, resolve: VersionResolver): void {
  for (const field of ["dependencies", "devDependencies"]) {
    const deps: Record<string, string> = pkg[field] ?? {};
    for (const [name, range] of Object.entries(deps)) {
      if (range !== "workspace:*" && range !== "managed") continue;
      const version = resolve(name);
      if (version === undefined) {
        throw new Error(`No version available for ${name}`);
      }
      deps[name] = version;
    }
  }
}

/**
 * Resolve versions from the `versions.json` written at build time
 * @param versions - package name → version
 * @returns the resolver
 */
export function fromVersionsFile(versions: Record<string, string>): VersionResolver {
  return name => versions[name];
}

/**
 * Resolve @webda packages to `link:` paths in a monorepo checkout, tools from @webda/core devDependencies
 * @param root - monorepo root
 * @returns the resolver
 */
export async function fromWorkspace(root: string): Promise<VersionResolver> {
  const links: Record<string, string> = {};
  let tools: Record<string, string> = {};
  for (const dir of await readdir(join(root, "packages"))) {
    const file = join(root, "packages", dir, "package.json");
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(await readFile(file, "utf8"));
    links[pkg.name] = `link:${join(root, "packages", dir)}`;
    if (pkg.name === "@webda/core") tools = pkg.devDependencies ?? {};
  }
  return name => links[name] ?? (EXTERNAL_TOOLS.includes(name) ? tools[name] : undefined);
}
