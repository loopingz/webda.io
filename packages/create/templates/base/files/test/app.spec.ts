import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TestApplication, WebdaApplicationTest } from "@webda/core/lib/test/index.js";
import { useModel, useService } from "@webda/core";

const appDir = resolve(import.meta.dirname, "..");

/**
 * Loads this application from its directory
 */
class AppTestApplication extends TestApplication {
  getNamespace() {
    return "__NAMESPACE__";
  }

  filterModule(_filename: string): boolean {
    return true;
  }
}

@suite
class AppTest extends WebdaApplicationTest {
  getTestConfiguration(): string {
    return appDir;
  }

  getApplication() {
    return new AppTestApplication(this.getTestConfiguration());
  }

  /**
   * Keep webda.config.json as is: the default would replace the store with a MemoryStore
   */
  async tweakApp() {}

  @test
  async configuredServicesStart() {
    const config = JSON.parse(readFileSync(resolve(appDir, "webda.config.json"), "utf8"));
    const started = Object.keys(this.webda.getServices());
    for (const name of Object.keys(config.services)) {
      assert.ok(started.includes(name), `${name} should start`);
    }
  }

  @test
  async summarizesTheTasksOfAProject() {
    const Project = useModel<any>("__NAMESPACE__/Project");
    const Task = useModel<any>("__NAMESPACE__/Task");
    const project = await Project.create({ name: "Launch" });
    await Task.create({ title: "Write the docs", done: true, project: project.getUUID() });
    await Task.create({ title: "Ship it", done: false, project: project.getUUID() });
    const summary = await (useService("TaskService" as any) as any).summary(project.getUUID());
    assert.deepStrictEqual(summary, { open: 1, done: 1 });
  }
}
