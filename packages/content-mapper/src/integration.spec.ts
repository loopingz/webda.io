/**
 * End-to-end check that `tsgo` can actually load and drive this package.
 *
 * The unit tests exercise the generators directly; this one exercises the parts
 * they cannot reach — the `typescript.contentMapper` manifest in package.json,
 * the JSON-RPC transport in `server.ts`, and the span map as TypeScript itself
 * consumes it. A broken manifest or protocol regression shows up here and
 * nowhere else.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const fixture = join(pkgRoot, "test", "fixture");
const require_ = createRequire(import.meta.url);

/** Path to the bundled native compiler. */
function tsgo(): string {
  const manifest = require_.resolve(`@typescript/typescript-${process.platform}-${process.arch}/package.json`);
  return join(dirname(manifest), "lib", "tsc");
}

/**
 * Make `@webda/content-mapper` resolvable from the fixture, the way it would be
 * in a real application that depends on it.
 */
beforeAll(() => {
  const scope = join(fixture, "node_modules", "@webda");
  const link = join(scope, "content-mapper");
  if (!existsSync(link)) {
    mkdirSync(scope, { recursive: true });
    symlinkSync(pkgRoot, link, "dir");
  }
});

/**
 * Run the compiler over the fixture.
 * @param config - tsconfig file name
 * @param externalCode - whether to allow content mappers to run
 * @returns combined compiler output
 */
function check(config: string, externalCode: boolean): string {
  const args = ["-p", join(fixture, config)];
  if (externalCode) args.push("--runExternalCode");
  const run = spawnSync(tsgo(), args, { cwd: fixture, encoding: "utf8" });
  return `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
}

describe("content mapper under tsgo", () => {
  it("is spawned by tsgo and produces type-correct output", () => {
    const output = check("tsconfig.mapper.json", true);
    // Nothing at all: the widened setter accepts the string assignment in
    // consumer.ts, and every generated accessor type-checks.
    expect(output).toBe("");
  }, 60_000);

  it("without the mapper, the same sources fail — proving the transform is what fixes them", () => {
    // `.model.ts` degrades to plain TypeScript, so the file still compiles as
    // authored, and the wide assignment in consumer.ts is correctly rejected.
    const output = check("tsconfig.json", false);
    expect(output).toContain("TS2322");
    expect(output).toContain("consumer.ts");
  }, 60_000);

  it("refuses to run content mappers without --runExternalCode", () => {
    const output = check("tsconfig.mapper.json", false);
    expect(output).toContain("TS100024");
  }, 60_000);
});
