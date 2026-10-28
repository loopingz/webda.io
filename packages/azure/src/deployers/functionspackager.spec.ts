import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readZip } from "../../../aws/test/unzip.js";
import { createAzureFunctionsPackage } from "./functionspackager.service.js";

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
      expect(content("webda-functions.mjs")).toContain('"schedule":"0 * * * * *"');
      expect(entries.some(entry => entry.name === "local.settings.json")).toBe(false);
      await createAzureFunctionsPackage(app, options);
      expect(readFileSync(result.zipPath)).toEqual(first);
      expect(packager.package.mock.calls[0][1].modules.includes).toContain("@azure/functions");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
