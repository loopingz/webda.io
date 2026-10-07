import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyVersions, EXTERNAL_TOOLS, fromVersionsFile, fromWorkspace } from "./versions.js";

@suite
class VersionsTest {
  @test
  replacesWorkspaceAndManagedVersions() {
    const pkg = {
      dependencies: { "@webda/core": "workspace:*", lodash: "^4.0.0" },
      devDependencies: { typescript: "managed" }
    };
    applyVersions(pkg, fromVersionsFile({ "@webda/core": "4.0.0-beta.3", typescript: "7.1.0" }));
    assert.deepStrictEqual(pkg, {
      dependencies: { "@webda/core": "4.0.0-beta.3", lodash: "^4.0.0" },
      devDependencies: { typescript: "7.1.0" }
    });
  }

  @test
  pinsSinonAsATool() {
    assert.ok(EXTERNAL_TOOLS.includes("sinon"));
    const pkg = { devDependencies: { sinon: "managed" } };
    applyVersions(pkg, fromVersionsFile({ sinon: "^21.0.3" }));
    assert.deepStrictEqual(pkg.devDependencies, { sinon: "^21.0.3" });
  }

  @test
  failsOnUnknownPackage() {
    assert.throws(
      () => applyVersions({ dependencies: { "@webda/nope": "workspace:*" } }, fromVersionsFile({})),
      /@webda\/nope/
    );
  }

  @test
  async linksWorkspacePackages() {
    const root = mkdtempSync(join(tmpdir(), "webda-repo-"));
    mkdirSync(join(root, "packages/core"), { recursive: true });
    mkdirSync(join(root, "packages/mongodb"), { recursive: true });
    writeFileSync(
      join(root, "packages/core/package.json"),
      JSON.stringify({
        name: "@webda/core",
        devDependencies: { typescript: "7.1.0", vitest: "^4.1.2", sinon: "^21.0.3" }
      })
    );
    writeFileSync(join(root, "packages/mongodb/package.json"), JSON.stringify({ name: "@webda/mongo" }));
    const resolve = await fromWorkspace(root);
    assert.strictEqual(resolve("@webda/core"), `link:${join(root, "packages/core")}`);
    assert.strictEqual(resolve("@webda/mongo"), `link:${join(root, "packages/mongodb")}`);
    assert.strictEqual(resolve("typescript"), "7.1.0");
    assert.strictEqual(resolve("sinon"), "^21.0.3");
    assert.strictEqual(resolve("@webda/unknown"), undefined);
  }
}
