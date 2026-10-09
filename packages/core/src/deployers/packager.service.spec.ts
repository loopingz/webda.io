import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { vi } from "vitest";
import { WebdaApplicationTest } from "../test/index.js";
import { PACKAGED_CONFIGURATION, PACKAGED_MARKER } from "./packager.js";
import { ApplicationPackager } from "./packager.service.js";

/**
 * Write a file, creating its folders
 * @param file - the file path
 * @param content - the content, objects are written as JSON
 */
function write(file: string, content: any = "") {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
}

@suite
class ApplicationPackagerTest extends WebdaApplicationTest {
  root: string;
  appPath: string;

  getTestConfiguration(): any {
    return { version: 4, parameters: {}, services: {} };
  }

  async beforeEach() {
    await super.beforeEach();
    this.root = realpathSync(mkdtempSync(join(tmpdir(), "webda-package-command-")));
    this.appPath = join(this.root, "app");
    write(join(this.appPath, "package.json"), { name: "app", version: "1.0.0", dependencies: { a: "1" } });
    write(join(this.appPath, "lib/app.js"), "// app");
    write(join(this.appPath, "node_modules/a/package.json"), { name: "a", version: "1.0.0" });
    write(join(this.appPath, "node_modules/a/index.js"), "// a");
  }

  async afterEach() {
    rmSync(this.root, { recursive: true, force: true });
  }

  /**
   * Application with the "Prod" deployment applied, the packager injected by the CLI and a unit
   * @returns the fake application
   */
  getApp(): any {
    return {
      applicationPath: this.appPath,
      getCurrentDeployment: () => "Prod",
      getDeployment: () => ({ units: [{ name: "Stack", type: "Webda/CloudFormationDeployer" }] }),
      getConfiguration: () => ({
        version: 4,
        parameters: { apiUrl: "https://api.prod" },
        services: {
          store: { type: "Webda/MemoryStore" },
          Stack: { type: "Webda/CloudFormationDeployer" },
          packager: { type: "Webda/ApplicationPackager" }
        },
        cachedModules: {
          project: { package: { name: "app", version: "1.0.0" }, webda: {}, deployment: {} },
          moddas: { "App/Local": { Import: "lib/app:Local" } },
          beans: {},
          models: {},
          schemas: {}
        }
      })
    };
  }

  /**
   * Create the packager on the fake application
   * @returns the packager
   */
  getPackager(): ApplicationPackager {
    const packager = new ApplicationPackager("packager", { type: "Webda/ApplicationPackager" } as any);
    // @ts-ignore protected
    vi.spyOn(packager, "getApplication").mockReturnValue(this.getApp());
    return packager;
  }

  @test
  async packageFolder() {
    await this.getPackager().package("dist/webda");
    // Relative output is resolved from the application folder
    const output = join(this.appPath, "dist/webda");
    assert.ok(existsSync(join(output, PACKAGED_MARKER)));
    assert.ok(existsSync(join(output, "node_modules/a/index.js")));
    const configuration = JSON.parse(readFileSync(join(output, PACKAGED_CONFIGURATION), "utf-8"));
    assert.strictEqual(configuration.parameters.apiUrl, "https://api.prod");
    assert.deepStrictEqual(Object.keys(configuration.services), ["store"], "no unit, no injected packager");
    assert.strictEqual(configuration.cachedModules.project.deployment.name, "Prod");
  }

  @test
  async configOnly() {
    const packager = this.getPackager();
    const json = await packager.package(undefined, true);
    const configuration = JSON.parse(json);
    assert.deepStrictEqual(Object.keys(configuration.services), ["store"]);
    assert.strictEqual(configuration.cachedModules.moddas["App/Local"].Import, "lib/app:Local");
    assert.ok(!existsSync(join(this.appPath, "dist")), "nothing written without output");

    await packager.package("prod.json", true);
    assert.deepStrictEqual(JSON.parse(readFileSync(join(this.appPath, "prod.json"), "utf-8")), configuration);
  }

  @test
  async refusesNonEmptyOutput() {
    write(join(this.appPath, "dist/webda/old.txt"), "old");
    await assert.rejects(() => this.getPackager().package("dist/webda"), /not empty/);
    assert.strictEqual(readFileSync(join(this.appPath, "dist/webda/old.txt"), "utf-8"), "old");
  }
}
