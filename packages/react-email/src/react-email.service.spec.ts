import { suite, test } from "@webda/test";
import { installConfigurationFactories, useService, type UnpackedConfiguration } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { getTemplateEngine } from "@webda/templates";
import * as assert from "assert";
import { existsSync, mkdtempSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { join, resolve } from "path";
import { ReactEmailEngine } from "./engine.js";
import { ReactEmailParameters, ReactEmailService } from "./react-email.service.js";

/**
 * Run the ReactEmailService from the sources rather than the compiled module
 */
class ReactEmailServiceTestBase extends WebdaApplicationTest {
  tmpDirs: string[] = [];

  /**
   * Register the ReactEmailService from sources, with the compiled parameters schema
   * @param app - the test application
   */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    installConfigurationFactories(ReactEmailService, ReactEmailParameters, app.getSchema("Webda/ReactEmailService"));
    app.addModda("Webda/ReactEmailService", ReactEmailService);
  }

  /**
   * @returns a new temporary output folder
   */
  async tmp(): Promise<string> {
    const dir = await mkdtemp(resolve("test/tmp-"));
    this.tmpDirs.push(dir);
    return dir;
  }

  async afterEach() {
    await Promise.all(this.tmpDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
  }
}

@suite
class ReactEmailServiceTest extends ReactEmailServiceTestBase {
  output = mkdtempSync(resolve("test/tmp-"));
  source = "test/emails-precompile";

  async beforeEach() {
    this.tmpDirs.push(this.output);
  }

  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: { ignoreBeans: true },
      services: {
        reactEmail: { type: "Webda/ReactEmailService", source: this.source, output: this.output }
      }
    };
  }

  @test
  async buildHook() {
    assert.strictEqual(await useService("reactEmail").build(), 0);
    assert.ok(existsSync(join(this.output, "event-confirmation/html.mustache")));
    assert.ok(existsSync(join(this.output, "event-confirmation/subject.mustache")));
  }

  @test
  async staticCommand() {
    const out = await this.tmp();
    assert.strictEqual(await ReactEmailService.buildTemplates("test/emails-precompile", out), 0);
    assert.ok(existsSync(join(out, "event-confirmation/html.mustache")));
  }

  @test
  async failureExitCode() {
    const out = await this.tmp();
    assert.strictEqual(await ReactEmailService.buildTemplates("test/emails-broken", out), 1);
  }

  @test
  engineRegistered() {
    assert.ok(getTemplateEngine("react-email") instanceof ReactEmailEngine);
  }
}
