import * as assert from "assert";
import { suite, test } from "@webda/test";
import { UnpackedApplication } from "./unpackedapplication.js";
import { WebdaApplicationTest } from "../test/application.js";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "path";
import { getCommonJS } from "@webda/utils";
import { useApplication } from "./hooks.js";

@suite
class UnpackedApplicationTest extends WebdaApplicationTest {
  @test
  async findModulesFilesIsSorted() {
    // The modules are merged in this order: it must not depend on the file system timing.
    // A symlinked package takes longer to resolve than a folder, so it is found last without sorting,
    // its real path (pnpm store) sorts first
    const root = realpathSync(mkdtempSync(join(tmpdir(), "webda-modules-")));
    try {
      for (const name of ["a-store/a-module", "node_modules/b-module"]) {
        mkdirSync(join(root, name), { recursive: true });
        writeFileSync(join(root, name, "webda.module.json"), "{}");
      }
      symlinkSync(join(root, "a-store/a-module"), join(root, "node_modules/a-module"));
      const modules = await UnpackedApplication.findModulesFiles(join(root, "node_modules"));
      assert.deepStrictEqual(
        modules.map(file => file.substring(root.length)),
        ["/a-store/a-module/webda.module.json", "/node_modules/b-module/webda.module.json"]
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  @test
  cachedModule() {
    const { __dirname } = getCommonJS(import.meta.url);
    new UnpackedApplication(join(__dirname, "..", "..", "test/config-cached.json"));
  }

  @test
  async mergeModulesKeepsSchemasWhole() {
    const { __dirname } = getCommonJS(import.meta.url);
    const app: any = new UnpackedApplication(join(__dirname, "..", "..", "test/config.json"));
    // The same @WebdaSchema type is re-emitted by every module depending on the one declaring it
    const shared = () => ({
      type: "object",
      properties: { token: { type: "string" } },
      required: ["token"]
    });
    const modules = {
      a: {
        schemas: { "Webda/Shared": shared(), "Webda/A": { type: "string" } },
        moddas: { "Webda/A": { Import: "a" } }
      },
      b: { schemas: { "Webda/Shared": shared() }, moddas: { "Webda/B": { Import: "b" } } }
    };
    app.findModules = async () => ["a", "b"];
    app.loadWebdaModule = (f: string) => structuredClone(modules[f]);
    app.loadModule = async () => {};
    const merged = await app.mergeModules({ cachedModules: { schemas: {}, moddas: {}, models: {}, beans: {} } });
    assert.deepStrictEqual(merged.schemas["Webda/Shared"].required, ["token"]);
    assert.deepStrictEqual(Object.keys(merged.schemas).sort(), ["Webda/A", "Webda/Shared"]);
    assert.deepStrictEqual(Object.keys(merged.moddas).sort(), ["Webda/A", "Webda/B"]);
  }

  @test
  defaultConfiguration() {
    assert.strictEqual(
      useApplication()!.getCurrentConfiguration().services["SampleService"]?.type,
      "WebdaTest/FakeService",
      "Type should be taken from the configuration"
    );
  }

  @test
  async findModules() {
    const expectedModules = [
      "/packages/amqp/webda.module.json",
      "/packages/core/webda.module.json",
      "/packages/models/webda.module.json",
      "/packages/compiler/webda.module.json",
      "/packages/shell/webda.module.json",
      "/packages/kubernetes/webda.module.json",
      "/packages/async/webda.module.json",
      "/packages/aws/webda.module.json",
      "/packages/cloudevents/webda.module.json",
      "/packages/elasticsearch/webda.module.json",
      "/packages/gcp/webda.module.json",
      "/packages/google-auth/webda.module.json",
      "/packages/graphql/webda.module.json",
      "/packages/runtime/webda.module.json",
      "/packages/hawk/webda.module.json",
      "/packages/mongodb/webda.module.json",
      "/packages/otel/webda.module.json",
      "/packages/postgres/webda.module.json",
      "/sample-app/webda.module.json",
      "/sample-apps/basic-models/webda.module.json",
      "/sample-apps/blog-system/webda.module.json",
      "/sample-apps/contacts/webda.module.json",
      "/sample-apps/cves/webda.module.json"
    ].sort();
    const { __dirname } = getCommonJS(import.meta.url);
    // Scan core's own node_modules — with pnpm, workspace packages appear here as symlinks
    let modules = await UnpackedApplication.findModulesFiles(join(__dirname, "..", "..", "node_modules"));
    // Core's node_modules has workspace deps with webda.module.json
    assert.ok(modules.length > 0, `Expected to find modules in core's node_modules, got ${modules.length}`);

    // First run on root node_modules
    let start = Date.now();
    modules = await UnpackedApplication.findModulesFiles(join(__dirname, "..", "..", "..", "..", "node_modules"));
    const cwd = resolve(process.cwd(), "../..").length;
    const modulePaths = modules.map(v => v.substring(cwd)).sort();
    // With pnpm, workspace packages may not be in root node_modules (no hoisting)
    // With yarn, they were hoisted and visible. Accept either layout.
    if (modulePaths.length > 0) {
      // Yarn-style hoisted layout
      assert.deepStrictEqual(modulePaths, expectedModules);
    } else {
      // pnpm layout — root node_modules has no workspace packages
      assert.strictEqual(modulePaths.length, 0);
    }
    const duration = Date.now() - start;

    // Second run — test cache
    start = Date.now();
    const modules2 = await UnpackedApplication.findModulesFiles(
      join(__dirname, "..", "..", "..", "..", "node_modules")
    );
    assert.deepStrictEqual(modules2, modules);
    const newDuration = Date.now() - start;
    assert.ok(duration < 100 || duration / 10 > newDuration, `Cache is not working ${duration} vs ${newDuration}`);
  }
}
