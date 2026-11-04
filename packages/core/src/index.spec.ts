import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { suite, test } from "@webda/test";
import * as assert from "assert";

/**
 * HTML sanitization loads a parsing stack that is only needed when sanitizing input
 */
const LAZY_PACKAGES = ["sanitize-html"];

/**
 * Guard the cold start of the framework (#926)
 */
@suite
class ColdStartTest {
  /**
   * Importing @webda/core must not load sanitize-html
   *
   * The import runs in a fresh Node process: the test process has already loaded them
   */
  @test
  importDoesNotLoadLazyPackages() {
    const index = join(import.meta.dirname, "..", "lib", "index.js");
    assert.ok(existsSync(index), `${index} is missing, build the package first`);
    // These packages are CommonJS: once loaded, they are in the require cache
    const script = `
      import { createRequire } from "node:module";
      import { pathToFileURL } from "node:url";
      await import(pathToFileURL(${JSON.stringify(index)}).href);
      console.log(JSON.stringify(Object.keys(createRequire(import.meta.url).cache)));
    `;
    const loaded: string[] = JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf-8" })
        .trim()
        .split("\n")
        .pop()
    );
    const packages = LAZY_PACKAGES.filter(name =>
      loaded.some(file => file.replace(/\\/g, "/").includes(`/node_modules/${name}/`))
    );
    assert.deepStrictEqual(packages, [], `import("@webda/core") loaded ${packages.join(", ")}`);
  }
}
