import { suite, test } from "@webda/test";
import * as assert from "assert";
import { readFileSync } from "node:fs";

/**
 * Resolve a conditional export like Node.js and the bundlers do: the first key, in object order,
 * that is in the active conditions wins
 *
 * @param target - the conditional export object
 * @param conditions - the active conditions
 * @returns the resolved file, undefined when nothing matches
 */
function resolveConditions(target: Record<string, string>, conditions: string[]): string | undefined {
  const key = Object.keys(target).find(k => k === "default" || conditions.includes(k));
  return key ? target[key] : undefined;
}

@suite
class ExportsTest {
  exports: Record<string, string> = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .exports["."];

  @test
  browserBundle() {
    // Vite, esbuild and webpack activate `browser` together with `import` for a browser build
    assert.strictEqual(resolveConditions(this.exports, ["browser", "import", "module"]), "./lib/browser.js");
    assert.strictEqual(resolveConditions(this.exports, ["browser", "require"]), "./lib/browser.js");
  }

  @test
  node() {
    assert.strictEqual(resolveConditions(this.exports, ["node", "import"]), "./lib/index.js");
    assert.strictEqual(resolveConditions(this.exports, ["node", "require"]), "./lib/index.js");
    assert.strictEqual(resolveConditions(this.exports, ["types", "import"]), "./lib/index.d.ts");
  }
}
