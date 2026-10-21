import { suite, test } from "@webda/test";
import { useService, type UnpackedConfiguration } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import * as assert from "assert";
import { vi } from "vitest";
import { TemplateService, registerTemplateEngine } from "./index.js";

const configure = vi.fn();
registerTemplateEngine("service-fake", { extensions: ["sfake"], configure, compile: () => () => "" });

@suite
class TemplateServiceTest extends WebdaApplicationTest {
  folders = ["test/templates-a", "test/templates-b"];

  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: { ignoreBeans: true },
      services: {
        TemplateService: {
          type: "Webda/TemplateService",
          folders: this.folders,
          engines: { "service-fake": { x: 1 } }
        }
      }
    };
  }

  @test
  availableByName() {
    // The module is loaded from lib, so compare by name rather than identity
    assert.strictEqual(useService("TemplateService").constructor.name, TemplateService.name);
  }

  @test
  async delegates() {
    const svc = useService("TemplateService");
    assert.strictEqual((await svc.renderAll("WELCOME", { name: "a" }, { locale: "fr" })).subject, "Bienvenue a");
    assert.ok(await svc.has("single"));
    assert.ok((await svc.list()).includes("single"));
    assert.strictEqual(await svc.render("single", { name: "a" }), "Single A a");
    assert.strictEqual(await svc.renderString("Hi {{n}}", { n: "x" }), "Hi x");
    assert.ok(svc.getRenderer());
    assert.ok(TemplateService.getEngine("mustache"));
  }

  @test
  configureCalled() {
    assert.deepStrictEqual(configure.mock.calls[0][0], { x: 1 });
  }

  @test
  async metrics() {
    const svc = useService("TemplateService");
    const metrics = Reflect.get(svc, "metrics");
    const total = async (name: string) =>
      (await metrics[name].get()).values.reduce((a: number, v: any) => a + v.value, 0);
    const renders = await total("render");
    const errors = await total("errors");
    await svc.render("single", { name: "a" });
    assert.strictEqual((await total("render")) - renders, 1);
    assert.ok((await metrics.render.get()).values.some((v: any) => v.labels.engine === "mustache"));
    assert.strictEqual((await total("errors")) - errors, 0);
    await assert.rejects(() => svc.render("nope"), { code: "TEMPLATE_NOT_FOUND" });
    assert.strictEqual((await total("errors")) - errors, 1);
  }
}

@suite
class TemplateServiceMissingFolderTest extends WebdaApplicationTest {
  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: { ignoreBeans: true },
      services: { TemplateService: { type: "Webda/TemplateService", folders: ["test/none"] } }
    };
  }

  @test
  async missingFolderWarns() {
    const svc = useService("TemplateService");
    const log = vi.spyOn(svc, "log");
    await svc.init();
    assert.ok(log.mock.calls.some(([level, message]) => level === "WARN" && String(message).includes("test/none")));
  }
}
