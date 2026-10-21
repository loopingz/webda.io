import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getWebdaPackages, registerWebdaPackage } from "./packages.js";

/**
 * Write a fixture package `@webda/fixture` under `dir`, registering itself from its entry
 * like every `@webda/*` package does
 *
 * @param dir - directory of the copy
 * @param version - version of the copy
 * @returns the URL of the fixture entry
 */
function writeFixture(dir: string, version: string): string {
  const pkgDir = join(dir, "fixture");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "@webda/fixture", version, type: "module" }));
  const helper = pathToFileURL(fileURLToPath(new URL("./packages.ts", import.meta.url))).href;
  writeFileSync(
    join(pkgDir, "index.js"),
    `import { registerWebdaPackage } from ${JSON.stringify(helper)};\nregisterWebdaPackage("@webda/fixture", import.meta.url);\nexport const loaded = true;\n`
  );
  return pathToFileURL(join(pkgDir, "index.js")).href;
}

@suite
class PackagesTest {
  tmp: string;

  beforeEach() {
    this.tmp = mkdtempSync(join(tmpdir(), "webda-packages-"));
    delete process.env.WEBDA_ALLOW_DUPLICATE_PACKAGES;
  }

  afterEach() {
    rmSync(this.tmp, { recursive: true, force: true });
    delete process.env.WEBDA_ALLOW_DUPLICATE_PACKAGES;
    // Drop the packages registered by the tests from the shared registry
    const registry: Map<string, unknown> = globalThis[Symbol.for("webda.packages")];
    registry.delete("@webda/fixture");
    registry.delete("@webda/dummy");
  }

  @test
  selfRegistered() {
    // @webda/utils registers itself when loaded
    const info = getWebdaPackages().get("@webda/utils");
    assert.ok(info);
    assert.ok(info.url.endsWith("/packages.ts") || info.url.endsWith("/packages.js"));
  }

  @test
  samePathTwice() {
    // A test runner reloading the same module must not fail
    registerWebdaPackage("@webda/dummy", "file:///app/node_modules/@webda/dummy/lib/index.js", "1.0.0");
    registerWebdaPackage("@webda/dummy", "file:///app/node_modules/@webda/dummy/lib/index.js", "1.0.0");
    assert.strictEqual(getWebdaPackages().get("@webda/dummy").version, "1.0.0");
  }

  @test
  sameVersionDifferentPath() {
    registerWebdaPackage("@webda/dummy", "file:///app/node_modules/@webda/dummy/lib/index.js", "1.0.0");
    assert.throws(
      () =>
        registerWebdaPackage(
          "@webda/dummy",
          "file:///app/node_modules/other/node_modules/@webda/dummy/lib/index.js",
          "1.0.0"
        ),
      (err: Error) => {
        assert.match(err.message, /^@webda\/dummy loaded twice: /);
        assert.ok(err.message.includes("/app/node_modules/@webda/dummy/lib/index.js (1.0.0)"));
        assert.ok(err.message.includes("/app/node_modules/other/node_modules/@webda/dummy/lib/index.js (1.0.0)"));
        assert.ok(err.message.includes("dedupe your install"));
        return true;
      }
    );
  }

  @test
  async fixtureCopies() {
    const first = writeFixture(join(this.tmp, "a"), "1.2.3");
    const second = writeFixture(join(this.tmp, "b"), "1.2.3");
    assert.strictEqual((await import(first)).loaded, true);
    await assert.rejects(
      () => import(second),
      (err: Error) => {
        // Versions are read from the package.json of each copy
        assert.ok(err.message.includes(`${join(this.tmp, "a", "fixture", "index.js")} (1.2.3)`), err.message);
        assert.ok(err.message.includes(`${join(this.tmp, "b", "fixture", "index.js")} (1.2.3)`), err.message);
        return true;
      }
    );
  }

  @test
  escapeHatch() {
    process.env.WEBDA_ALLOW_DUPLICATE_PACKAGES = "1";
    const errors: any[] = [];
    const original = console.error;
    console.error = (...args: any[]) => errors.push(args);
    try {
      registerWebdaPackage("@webda/dummy", "file:///a/index.js", "1.0.0");
      registerWebdaPackage("@webda/dummy", "file:///b/index.js", "2.0.0");
    } finally {
      console.error = original;
    }
    assert.strictEqual(errors.length, 1);
    assert.ok(String(errors[0][0]).includes("@webda/dummy loaded twice"));
    // The first copy stays registered
    assert.strictEqual(getWebdaPackages().get("@webda/dummy").url, "file:///a/index.js");
  }
}
