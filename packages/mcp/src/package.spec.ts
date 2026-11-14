import { suite, test } from "@webda/test";
import * as assert from "assert";
import { readdirSync, readFileSync } from "node:fs";

@suite
class PackageTest {
  /**
   * A strict installer (pnpm, Bazel runfiles) links only `dependencies` and `peerDependencies` beside
   * the published package: a runtime import declared as a devDependency fails with ERR_MODULE_NOT_FOUND
   */
  @test
  runtimeImportsAreDeclared() {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]);
    const src = new URL("./", import.meta.url);
    const missing: string[] = [];
    for (const file of readdirSync(src).filter(f => f.endsWith(".ts") && !f.endsWith(".spec.ts"))) {
      const code = readFileSync(new URL(file, src), "utf8");
      for (const [, mod] of code.matchAll(
        /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["'](@webda\/[a-z0-9-]+)/gm
      )) {
        if (!declared.has(mod)) missing.push(`${file}: ${mod}`);
      }
    }
    assert.deepStrictEqual(missing, []);
  }
}
