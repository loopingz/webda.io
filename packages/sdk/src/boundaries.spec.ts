import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const FORBIDDEN = [
  /["']@webda\/core/,
  /["']@webda\/models/,
  /["']@webda\/workout/,
  /["']@webda\/utils/,
  /["']node:/,
  /["'][./]*\/generate\//,
  /["'][./]*\/manifest/
];

/**
 * List the non-spec TypeScript files of a folder, recursively
 * @param dir - the folder
 * @returns the file paths
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".ts") && !path.endsWith(".spec.ts") && !path.endsWith("fixture.ts") ? [path] : [];
  });
}

/** The entries that must run in a browser: `./client` and `./client/graphql` */
const BROWSER_ENTRIES = ["src/client/index.ts", "src/client/graphql/index.ts"];

describe("client entry boundaries", () => {
  it("checks every browser entry", () => {
    const checked = sources(join(root, "src", "client")).map(file => file.substring(root.length + 1));
    for (const entry of BROWSER_ENTRIES) expect(checked).toContain(entry);
    const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.client.json"), "utf8"));
    expect(tsconfig.include).toContain("src/client/**/*");
  });

  it("imports nothing from Node or the server packages", () => {
    for (const file of sources(join(root, "src", "client"))) {
      const imports = readFileSync(file, "utf8")
        .split("\n")
        .filter(line => /^\s*(import|export)\b.*from\s/.test(line));
      for (const line of imports) {
        expect(
          FORBIDDEN.some(re => re.test(line)),
          `${file} must not import: ${line.trim()}`
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
