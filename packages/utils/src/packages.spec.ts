import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  previousEscapeHatch: string | undefined;

  beforeEach() {
    this.tmp = mkdtempSync(join(tmpdir(), "webda-packages-"));
    this.previousEscapeHatch = process.env.WEBDA_ALLOW_DUPLICATE_PACKAGES;
    delete process.env.WEBDA_ALLOW_DUPLICATE_PACKAGES;
  }

  afterEach() {
    rmSync(this.tmp, { recursive: true, force: true });
    delete process.env.WEBDA_ALLOW_DUPLICATE_PACKAGES;
    if (this.previousEscapeHatch !== undefined) {
      process.env.WEBDA_ALLOW_DUPLICATE_PACKAGES = this.previousEscapeHatch;
    }
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
        // Vite may uppercase the Windows drive letter when resolving a module URL.
        const normalize = (value: string) =>
          process.platform === "win32" ? value.replace(/\\/g, "/").toLowerCase() : value;
        assert.ok(
          normalize(err.message).includes(normalize(`${join(this.tmp, "a", "fixture", "index.js")} (1.2.3)`)),
          err.message
        );
        assert.ok(
          normalize(err.message).includes(normalize(`${join(this.tmp, "b", "fixture", "index.js")} (1.2.3)`)),
          err.message
        );
        return true;
      }
    );
  }

  @test
  async duplicatedHelper() {
    const original = getWebdaPackages().get("@webda/utils");
    const copy = join(this.tmp, "packages.ts");
    writeFileSync(copy, readFileSync(new URL("./packages.ts", import.meta.url)));
    await assert.rejects(() => import(pathToFileURL(copy).href), /@webda\/utils loaded twice/);
    assert.strictEqual(getWebdaPackages().get("@webda/utils"), original);
  }

  @test
  unavailablePackageVersions() {
    // Browser URLs and malformed file URLs must still produce useful duplicate errors.
    for (const urls of [
      ["https://example.com/a.js", "https://example.com/b.js"],
      ["file://%invalid/a.js", "file://%invalid/b.js"]
    ]) {
      globalThis[Symbol.for("webda.packages")].delete("@webda/dummy");
      registerWebdaPackage("@webda/dummy", urls[0]);
      assert.throws(() => registerWebdaPackage("@webda/dummy", urls[1]), /\(unknown\)/);
    }
    for (const contents of ["{", JSON.stringify({ name: "other" }), JSON.stringify({ name: "@webda/dummy" })]) {
      globalThis[Symbol.for("webda.packages")].delete("@webda/dummy");
      writeFileSync(join(this.tmp, "package.json"), contents);
      const first = pathToFileURL(join(this.tmp, "a.js")).href;
      const second = pathToFileURL(join(this.tmp, "b.js")).href;
      registerWebdaPackage("@webda/dummy", first);
      assert.throws(() => registerWebdaPackage("@webda/dummy", second), /\(unknown\)/);
    }
  }

  @test
  escapeHatchRequiresOne() {
    registerWebdaPackage("@webda/dummy", "file:///a/index.js", "1.0.0");
    for (const value of ["0", "false", "true", ""]) {
      process.env.WEBDA_ALLOW_DUPLICATE_PACKAGES = value;
      assert.throws(
        () => registerWebdaPackage("@webda/dummy", "file:///b/index.js", "1.0.0"),
        /@webda\/dummy loaded twice/
      );
    }
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
