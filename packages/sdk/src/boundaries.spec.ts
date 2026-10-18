import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/** Modules no client entry may import: the server side */
const SERVER = [/^@webda\/core/, /^@webda\/models/, /^@webda\/workout/, /^@webda\/utils/, /\/generate\//, /\/manifest/];
/** Modules the browser entries may not import either: Node.js and the Node-only gRPC entry with its dependencies */
const FORBIDDEN = [...SERVER, /^node:/, /^@grpc\//, /(^|\/)grpc(\/|$)/];

/** The Node-only entry (`./client/grpc`) */
const NODE_ONLY = join(root, "src", "client", "grpc");

/** The entries that must run in a browser: `./client` and `./client/graphql` */
const BROWSER_ENTRIES = ["src/client/index.ts", "src/client/graphql/index.ts"];

/**
 * List the non-spec TypeScript files of a folder, recursively
 * @param dir - the folder
 * @param skip - a folder to leave out
 * @returns the file paths
 */
function sources(dir: string, skip?: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (path === skip) return [];
    if (statSync(path).isDirectory()) return sources(path, skip);
    return path.endsWith(".ts") && !path.endsWith(".spec.ts") && !path.endsWith("fixture.ts") ? [path] : [];
  });
}

/**
 * @param file - a source file
 * @returns the modules it imports, statically or dynamically
 */
function importsOf(file: string): string[] {
  const code = readFileSync(file, "utf8");
  return [...code.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm)].map(match => match[1]);
}

describe("client entry boundaries", () => {
  it("checks every browser entry, and only them", () => {
    const checked = sources(join(root, "src", "client"), NODE_ONLY).map(file => file.substring(root.length + 1));
    for (const entry of BROWSER_ENTRIES) expect(checked).toContain(entry);
    expect(checked.some(file => file.includes("/grpc/"))).toBe(false);
    const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.client.json"), "utf8"));
    expect(tsconfig.include).toContain("src/client/**/*");
    expect(tsconfig.exclude).toContain("src/client/grpc/**");
  });

  it("browser entries import nothing from Node, gRPC or the server packages", () => {
    for (const file of sources(join(root, "src", "client"), NODE_ONLY)) {
      for (const module of importsOf(file)) {
        expect(
          FORBIDDEN.some(re => re.test(module)),
          `${file} must not import ${module}`
        ).toBe(false);
      }
    }
  });

  it("the Node-only gRPC entry imports nothing from the server packages", () => {
    const files = sources(NODE_ONLY);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const module of importsOf(file)) {
        expect(
          SERVER.some(re => re.test(module)),
          `${file} must not import ${module}`
        ).toBe(false);
      }
    }
  });

  it("type-checks with lib ES2022 + DOM and no ambient types (tsconfig.client.json)", () => {
    const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
    const run = spawnSync(process.execPath, [tsc, "-p", join(root, "tsconfig.client.json")], {
      cwd: root,
      encoding: "utf8"
    });
    expect(run.stdout + run.stderr, run.stdout + run.stderr).toBe("");
    expect(run.status).toBe(0);
  });
});
