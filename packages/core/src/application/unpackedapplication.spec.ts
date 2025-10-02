import * as assert from "assert";
import { suite, test } from "@webda/test";
import { UnpackedApplication } from "./unpackedapplication";
import { WebdaApplicationTest } from "../test/application";
import { join, resolve } from "path";
import { getCommonJS } from "@webda/utils";
import { useApplication } from "./hooks";

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
      "/sample-app/webda.module.json"
    ].sort();
    const { __dirname } = getCommonJS(import.meta.url);
    let modules = await UnpackedApplication.findModulesFiles(join(__dirname, "..", "..", "node_modules"));
    assert.strictEqual(modules.length, 0);

    // First run
    let start = Date.now();
    modules = await UnpackedApplication.findModulesFiles(join(__dirname, "..", "..", "..", "..", "node_modules"));
    const cwd = resolve(process.cwd(), "../..").length;
    assert.deepStrictEqual(modules.map(v => v.substring(cwd)).sort(), expectedModules);
    const duration = Date.now() - start;

    // Second run
    start = Date.now();
    modules = await UnpackedApplication.findModulesFiles(join(__dirname, "..", "..", "..", "..", "node_modules"));
    assert.deepStrictEqual(modules.map(v => v.substring(cwd)).sort(), expectedModules);
    // Ensure our cache is working
    const newDuration = Date.now() - start;
    assert.ok(duration < 100 || duration / 10 > newDuration, `Cache is not working ${duration} vs ${newDuration}`);
  }
}
