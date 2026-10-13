import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { SampleAppTest } from "../test/sample-app.js";
import { DEFAULT_SHARED_IMPORTS, SdkGenerator } from "./sdkgenerator.service.js";

@suite
class SdkGeneratorTest extends SampleAppTest {
  @test
  defaultsItsParameters() {
    const params = SdkGenerator.createConfiguration();
    assert.strictEqual(params.outDir, ".webda/sdk");
    assert.strictEqual(params.models, true);
    assert.deepStrictEqual(params.sharedImports, DEFAULT_SHARED_IMPORTS);
  }

  @test
  async writesTheSdkFromTheBuildHookAndTheCommand() {
    const root = mkdtempSync(join(tmpdir(), "webda-sdkgen-"));
    const params = this.generator.getParameters();
    const outDir = params.outDir;
    params.outDir = join(root, "default");
    params.package = { name: "@demo/sdk" };
    try {
      // Build hook and command without a folder: the `outDir` parameter
      await this.generator.build();
      const files = readdirSync(join(root, "default")).sort();
      assert.deepStrictEqual(files, [
        "index.ts",
        "manifest.json",
        "models.ts",
        "operations.ts",
        "package.json",
        "types.ts"
      ]);
      assert.strictEqual(JSON.parse(readFileSync(join(root, "default", "package.json"), "utf8")).name, "@demo/sdk");
      rmSync(join(root, "default"), { recursive: true });
      await this.generator.generate();
      assert.ok(existsSync(join(root, "default", "index.ts")));
      // Command with a folder
      await this.generator.generate(join(root, "other"));
      assert.ok(existsSync(join(root, "other", "operations.ts")));
    } finally {
      params.outDir = outDir;
      params.package = undefined;
      rmSync(root, { recursive: true, force: true });
    }
  }

  @test
  async printsTheManifest() {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await this.generator.printManifest();
      const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
      const manifest = JSON.parse(output);
      assert.strictEqual(manifest.version, 1);
      assert.strictEqual(manifest.namespace, "WebdaDemo");
      assert.ok(manifest.operations["Company.Get"]);
    } finally {
      write.mockRestore();
    }
  }
}
