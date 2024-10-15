import * as assert from "assert";
import { suite, test } from "@webda/test";
import { UnpackedApplication } from "./unpackedapplication";
import { WebdaApplicationTest } from "../test/test";
import { resolve } from "path";

@suite
class UnpackedApplicationTest extends WebdaApplicationTest {
  @test
  cachedModule() {
    new UnpackedApplication("./test/config-cached.json");
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
    let modules = await UnpackedApplication.findModulesFiles("./node_modules");
    assert.strictEqual(modules.length, 0);

    // First run
    let start = Date.now();
    modules = await UnpackedApplication.findModulesFiles("../../node_modules");
    const cwd = resolve(process.cwd(), "../..").length;
    assert.deepStrictEqual(modules.map(v => v.substring(cwd)).sort(), expectedModules);
    const duration = Date.now() - start;

    // Second run
    start = Date.now();
    modules = await UnpackedApplication.findModulesFiles("../../node_modules");
    assert.deepStrictEqual(modules.map(v => v.substring(cwd)).sort(), expectedModules);
    // Ensure our cache is working
    const newDuration = Date.now() - start;
    assert.ok(duration / 10 > newDuration, `Cache is not working ${duration} vs ${newDuration}`);
  }
}
