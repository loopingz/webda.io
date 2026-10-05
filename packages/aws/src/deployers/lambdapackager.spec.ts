import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { WebdaApplicationTest } from "@webda/core/lib/test/index.js";
import { vi } from "vitest";
import { readZip } from "../../test/unzip.js";
import {
  createLambdaPackage,
  LAMBDA_SERVER_TYPE,
  LambdaPackager,
  LambdaPackagerParameters
} from "./lambdapackager.service.js";

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
class LambdaPackagerTest {
  root: string;

  /**
   * A small application with a dependency and the aws-sdk
   */
  beforeEach() {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), "webda-lambda-")));
    write(join(this.root, "package.json"), {
      name: "app",
      version: "1.2.3",
      dependencies: { dep: "1", "aws-sdk": "2" }
    });
    write(join(this.root, "lib/app.js"), "export const app = true;");
    write(join(this.root, "src/app.ts"), "export const app = true;");
    write(join(this.root, "dist/old.zip"), "previous package");
    write(join(this.root, "handler.js"), "export const handler = () => {};");
    write(join(this.root, "node_modules/dep/package.json"), { name: "dep", version: "1.0.0" });
    write(join(this.root, "node_modules/dep/index.js"), "module.exports = 1;");
    write(join(this.root, "node_modules/aws-sdk/package.json"), { name: "aws-sdk", version: "2.0.0" });
    write(join(this.root, "node_modules/aws-sdk/index.js"), "module.exports = 2;");
  }

  afterEach() {
    rmSync(this.root, { recursive: true, force: true });
  }

  /**
   * Fake application
   * @param services - the configured services
   * @returns the application
   */
  getApp(services: any = { store: { type: "Webda/MemoryStore" } }): any {
    return {
      applicationPath: this.root,
      getCurrentDeployment: () => "Production",
      getDeployment: () => ({ units: [] }),
      getConfiguration: () => ({
        version: 4,
        parameters: {},
        services,
        cachedModules: {
          project: { package: { name: "app", version: "1.2.3" }, webda: {}, deployment: { name: "Production" } },
          moddas: {},
          beans: {},
          models: {},
          schemas: {}
        }
      })
    };
  }

  @test
  async packageWithDefaults() {
    const result = await createLambdaPackage(this.getApp());
    assert.strictEqual(result.zipPath, join(this.root, "dist/lambda.zip"));
    const entries = readZip(result.zipPath);
    assert.strictEqual(result.files, entries.length);
    const names = entries.map(e => e.name);
    assert.ok(names.includes("lib/app.js"));
    assert.ok(names.includes("node_modules/dep/index.js"));
    assert.ok(names.includes("package.json"));
    // Sources, previous packages and the aws-sdk are not packaged
    assert.ok(!names.some(n => n.startsWith("src/")));
    assert.ok(!names.some(n => n.startsWith("dist/")));
    assert.ok(!names.some(n => n.startsWith("node_modules/aws-sdk/")));
    assert.ok(!names.includes("entrypoint.js"));
    // A LambdaServer is added to the packaged configuration
    const config = JSON.parse(entries.find(e => e.name === "webda.config.json").data.toString());
    assert.deepStrictEqual(config.services.LambdaServer, { type: LAMBDA_SERVER_TYPE });
    assert.deepStrictEqual(config.services.store, { type: "Webda/MemoryStore" });
    assert.ok(names.includes(".webda/packaged.json"));
  }

  @test
  async packageWithOptions() {
    const result = await createLambdaPackage(this.getApp({ api: { type: "Webda/LambdaServer" } }), {
      zipPath: "build/custom.zip",
      entrypoint: "handler.js",
      customAwsSdk: true,
      package: { excludePatterns: ["dep/index\\.js$"] }
    });
    assert.strictEqual(result.zipPath, join(this.root, "build/custom.zip"));
    const entries = readZip(result.zipPath);
    const names = entries.map(e => e.name);
    assert.ok(names.includes("node_modules/aws-sdk/index.js"));
    assert.ok(!names.includes("node_modules/dep/index.js"));
    assert.strictEqual(
      entries.find(e => e.name === "entrypoint.js").data.toString(),
      "export const handler = () => {};"
    );
    // The configured LambdaServer is kept, no other is added
    const config = JSON.parse(entries.find(e => e.name === "webda.config.json").data.toString());
    assert.deepStrictEqual(Object.keys(config.services), ["api"]);
  }
}

@suite
class LambdaPackagerCommandTest extends WebdaApplicationTest {
  fixture = new LambdaPackagerTest();

  getTestConfiguration(): any {
    return { version: 3, parameters: {}, services: {} };
  }

  async beforeEach() {
    await super.beforeEach();
    this.fixture.beforeEach();
  }

  async afterEach() {
    this.fixture.afterEach();
  }

  @test
  async packageCommand() {
    const packager = new LambdaPackager(
      "Lambda",
      new LambdaPackagerParameters().load({ type: "Webda/LambdaPackager" })
    );
    assert.strictEqual(packager.getParameters().zipPath, "dist/lambda-${package.version}.zip");
    // @ts-ignore protected
    vi.spyOn(packager, "getApplication").mockReturnValue(this.fixture.getApp());
    const result = await packager.package();
    // The deployment variables are replaced, the package version comes from the application
    assert.match(result.zipPath, /dist\/lambda-[^/$]+\.zip$/);
    assert.ok(!result.zipPath.includes("${"));
    assert.ok(readZip(result.zipPath).some(e => e.name === "lib/app.js"));
  }
}
