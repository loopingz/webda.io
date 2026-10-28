import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readZip } from "../../../core/test/unzip.js";
import { createAzureFunctionsPackage } from "./functionspackager.service.js";
import { AzureFunctionsPackager, AzureFunctionsPackagerParameters } from "./functionspackager.service.js";
import { AzureFunctionsDeployer, AzureFunctionsDeployerParameters } from "./functions.service.js";
import { suite, test } from "@webda/test";
import { useDynamicService } from "@webda/core";
import { addAzureModda, AzureTest } from "../../test/fixture.js";

const packager = vi.hoisted(() => ({
  package: vi.fn(async () => ({
    configuration: { services: {} },
    files: [
      {
        target: "package.json",
        content: JSON.stringify({
          name: "sample",
          type: "module",
          main: "lib/index.js",
          devDependencies: { test: "1" },
          scripts: { test: "false" },
          workspaces: []
        })
      },
      { target: "webda.config.json", content: "{}" },
      { target: "lib/index.js", content: "export const hello = true;" },
      { target: "local.settings.json", content: '{"secret":"private"}' },
      { target: "host.json", content: "{}" }
    ]
  }))
}));
vi.mock("@webda/core", async original => ({
  ...(await original<typeof import("@webda/core")>()),
  packageApplication: packager.package
}));

describe("Functions packaging", () => {
  it("preserves a configured adapter and cached module while normalizing custom timers", async () => {
    const dir = mkdtempSync(join(tmpdir(), "webda-custom-functions-"));
    const definition = { Import: "custom/adapter:Server", Configuration: "custom/adapter.schema.json" };
    packager.package.mockResolvedValueOnce({
      configuration: {
        services: { CustomHttp: { type: "Webda/AzureFunctionServer" } },
        cachedModules: { moddas: { "Webda/AzureFunctionServer": definition } }
      },
      files: [
        { target: "package.json", content: '{"type":"module"}' },
        { target: "webda.config.json", content: "{}" }
      ]
    } as any);
    try {
      const result = await createAzureFunctionsPackage({ applicationPath: dir } as any, {
        triggers: [{ type: "timer", name: "custom", schedule: "* * * * *" }]
      });
      const entries = readZip(result.zipPath);
      const config = JSON.parse(entries.find(entry => entry.name === "webda.config.json")!.data.toString());
      expect(config.services).toEqual({ CustomHttp: { type: "Webda/AzureFunctionServer" } });
      expect(config.cachedModules.moddas["Webda/AzureFunctionServer"]).toEqual(definition);
      expect(entries.find(entry => entry.name === "webda-functions.mjs")!.data.toString()).toContain(
        '"schedule":"0 * * * * *"'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates a deterministic v4 archive with HTTP and timer registrations", async () => {
    const dir = mkdtempSync(join(tmpdir(), "webda-functions-"));
    try {
      const app = { applicationPath: dir } as any;
      const options = {
        crons: [{ id: "cron1", schedule: "* * * * *" }],
        triggers: [{ name: "queue", type: "servicebus" as const, queueName: "work", connection: "Bus" }]
      };
      const result = await createAzureFunctionsPackage(app, options);
      const first = readFileSync(result.zipPath);
      const entries = readZip(result.zipPath);
      const content = (name: string) => entries.find(entry => entry.name === name)!.data.toString();
      expect(JSON.parse(content("package.json"))).toMatchObject({ main: "webda-functions.mjs" });
      expect(JSON.parse(content("package.json")).devDependencies).toBeUndefined();
      expect(JSON.parse(content("host.json")).extensions.http.routePrefix).toBe("");
      expect(JSON.parse(content("webda.config.json")).services.AzureFunctionServer.type).toBe(
        "Webda/AzureFunctionServer"
      );
      expect(JSON.parse(content("webda.config.json")).cachedModules.moddas["Webda/AzureFunctionServer"].Import).toBe(
        "node_modules/@webda/azure/lib/services/functionserver.service:AzureFunctionServer"
      );
      expect(content("webda-functions.mjs")).toContain('"schedule":"0 * * * * *"');
      expect(entries.some(entry => entry.name === "local.settings.json")).toBe(false);
      await createAzureFunctionsPackage(app, options);
      expect(readFileSync(result.zipPath)).toEqual(first);
      expect(packager.package.mock.calls.at(-1)![1].modules.includes).toContain("@azure/functions");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

@suite
class FunctionsPackageCommandsTest extends AzureTest {
  dir = mkdtempSync(join(tmpdir(), "webda-package-commands-"));

  async tweakApp(app) {
    await super.tweakApp(app);
    addAzureModda(app, "Test/Packager", AzureFunctionsPackager, AzureFunctionsPackagerParameters);
    addAzureModda(app, "Test/Functions", AzureFunctionsDeployer, AzureFunctionsDeployerParameters);
    Object.assign(app.getCurrentConfiguration().services, {
      Packager: { type: "Test/Packager", zipPath: join(this.dir, "package.zip") },
      Functions: { type: "Test/Functions", zipPath: join(this.dir, "functions.zip") }
    });
  }

  @test async packagesThroughBothDeploymentUnits() {
    const packager = useDynamicService<AzureFunctionsPackager>("Packager");
    const functions = useDynamicService<AzureFunctionsDeployer>("Functions");
    expect((await packager.package()).files).toBeGreaterThan(0);
    expect((await functions.packageApplication()).size).toBeGreaterThan(0);
  }

  async afterAll() {
    await super.afterAll();
    rmSync(this.dir, { recursive: true, force: true });
  }
}
