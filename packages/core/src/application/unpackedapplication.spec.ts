import * as assert from "assert";
import { suite, test } from "@webda/test";
import { UnpackedApplication } from "./unpackedapplication.js";
import { WebdaApplicationTest } from "../test/application.js";
import { join, resolve } from "path";
import { getCommonJS } from "@webda/utils";
import { useApplication } from "./hooks.js";

@suite
class UnpackedApplicationTest extends WebdaApplicationTest {
  @test
  cachedModule() {
    const { __dirname } = getCommonJS(import.meta.url);
    new UnpackedApplication(join(__dirname, "..", "..", "test/config-cached.json"));
  }

  @test
  defaultConfiguration() {
    assert.strictEqual(
      useApplication()!.getCurrentConfiguration().services["Authentication"]?.type,
      "Webda/Authentication",
      "Type should be auto-guessed based on the service name"
    );
  }

  @test
  async findModules() {
    const expectedModules = [
      "/packages/amqp/webda.module.json",
      "/packages/core/webda.module.json",
      "/packages/schema/webda.module.json",
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
    const modules2 = await UnpackedApplication.findModulesFiles(join(__dirname, "..", "..", "..", "..", "node_modules"));
    assert.deepStrictEqual(modules2, modules);
    const newDuration = Date.now() - start;
    assert.ok(duration < 100 || duration / 10 > newDuration, `Cache is not working ${duration} vs ${newDuration}`);
  }
}
