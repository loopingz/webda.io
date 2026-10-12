import { suite, test } from "@webda/test";
import * as assert from "assert";
import { rmSync } from "node:fs";
import { SampleAppTest } from "../../test/sample-app.js";
import { typeCheck, writeSdk } from "../../test/compile.js";
import type { SdkManifest } from "../manifest.js";
import { assignNames, generateSdk, generatorNames, pascalCase, rewriteSchema, splitRef } from "./index.js";

/** What a frontend would write against the generated SDK: compiles only when the types are right */
const TYPE_CHECKS = `
import { createClient, type Types } from "./index.js";
import type { Company, User, SubSubProjectClient } from "./models.js";
import type { Operations } from "./operations.js";

const api = createClient({ baseUrl: "https://api.example.com" });
async function run(client: SubSubProjectClient) {
  const company: Company = await api.Company.get("c1");
  const name: string = company.name;
  const users = await company.users.query("name LIKE 'a%'");
  const user: User = users.results[0];
  const parent: Company = await user.company.get();
  const me: Operations["Company.Get"]["output"] = await api.call("Company.Get", { uuid: "c1" });
  const created = await api.Company.create({ name: "Acme" });
  await api.SubSubProject.action("p1", { param: "x" }, { parents: [created.uuid] });
  await client.action("p1", { param: "x" });
  const page = await api.Company.query("name = 'a' LIMIT 1");
  const typed: Types.Company["name"] = company.name;
  void typed;
  for await (const c of api.Company.iterate()) void c.name;
  void page.continuationToken;
  // @ts-expect-error unknown operation
  await api.call("Unknown");
  // @ts-expect-error wrong input
  await api.call("Company.Get", { nope: 1 });
  // @ts-expect-error wrong output
  const wrong: number = await api.call("Company.Get", { uuid: "c1" });
  void wrong;
  void name;
  void parent;
  void me;
  const stream = api.stream("CustomService.TestOperation", { test: "x" } as any);
  void stream;
}
void run;
`;

@suite
class GenerateSdkTest extends SampleAppTest {
  @test
  async generatesAnSdkThatCompilesAsABrowserProject() {
    const manifest = this.generator.manifest();
    const files = await generateSdk(manifest, { package: { name: "@demo/sdk", version: "1.2.3" } });
    assert.deepStrictEqual(Object.keys(files).sort(), [
      "index.ts",
      "manifest.json",
      "models.ts",
      "operations.ts",
      "package.json",
      "types.ts"
    ]);
    assert.deepStrictEqual(JSON.parse(files["manifest.json"]).version, 1);
    assert.deepStrictEqual(JSON.parse(files["package.json"]), {
      name: "@demo/sdk",
      version: "1.2.3",
      type: "module",
      main: "index.ts",
      types: "index.ts",
      dependencies: { "@webda/sdk": "*" }
    });
    // Types
    assert.match(files["types.ts"], /export interface Company \{/);
    assert.match(files["types.ts"], /export interface SubSubProjectActionInput \{/);
    assert.match(files["types.ts"], /export interface CompanyQueryResult \{/);
    assert.match(files["types.ts"], /export interface CompanyPrimaryKey \{/);
    assert.match(files["types.ts"], /results\?: Company\[\]/);
    // Operations
    assert.match(files["operations.ts"], /"Company\.Get": \{ input: T\.CompanyPrimaryKey; output: T\.Company \}/);
    assert.match(files["operations.ts"], /"Company\.Patch": \{ input: Partial<T\.CompanyInput>; output: T\.Company \}/);
    assert.match(
      files["operations.ts"],
      /"SubSubProject\.Action": \{ input: T\.UuidRequest & T\.SubSubProjectActionInput; output: T\.SubSubProjectActionOutput \}/
    );
    assert.match(
      files["operations.ts"],
      /"Hardware\.GlobalAction": \{ input: T\.HardwareGlobalActionInput; output: T\.HardwareGlobalActionOutput \}/
    );
    assert.match(files["operations.ts"], /export const OPERATIONS: OperationsManifest = \{/);
    assert.match(files["operations.ts"], /export const MODELS: ModelsManifest = \{/);
    assert.ok(!files["operations.ts"].includes('"summary"'), "runtime descriptors carry no documentation");
    // Models
    assert.match(
      files["models.ts"],
      /export interface User extends Omit<T\.User, "company" \| "computers" \| "contacts"> \{\}/
    );
    assert.match(
      files["models.ts"],
      /export class User extends SdkModel<T\.User> \{\n  declare company: Link<Company>;\n  declare computers: Related<Computer>;\n  declare contacts: Related<Contact>;/
    );
    assert.match(files["models.ts"], /declare _loanTo: Link<User>;/);
    assert.match(files["models.ts"], /declare test: Date;/);
    assert.match(files["models.ts"], /export class SubSubProjectClient extends ModelClient<SubSubProject> \{/);
    // `action` is a ModelClient method: the model's `action` action is exposed as `actionAction`
    assert.match(
      files["models.ts"],
      /actionAction\(pk: PrimaryKeyInput, input: T\.SubSubProjectActionInput, options\?: CallOptions\): Promise<T\.SubSubProjectActionOutput>/
    );
    assert.match(
      files["models.ts"],
      /action2\(pk: PrimaryKeyInput, input: T\.SubSubProjectAction2Input, options\?: CallOptions\)/
    );
    assert.match(files["models.ts"], /globalAction\(input: T\.HardwareGlobalActionInput, options\?: CallOptions\)/);
    assert.match(files["models.ts"], /readonly images = \{/);
    assert.match(files["models.ts"], /readonly password = \{/);
    // Index
    assert.match(files["index.ts"], /readonly Company: CompanyClient;/);
    assert.match(files["index.ts"], /export function createClient\(options: ClientOptions = \{\}\): Client \{/);
    const dir = writeSdk(files, { "check.ts": TYPE_CHECKS });
    try {
      assert.strictEqual(typeCheck(dir), "");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @test
  async generatesWithoutModels() {
    const manifest = this.generator.manifest();
    const files = await generateSdk(manifest, { models: false });
    assert.strictEqual(files["models.ts"], undefined);
    assert.ok(!files["index.ts"].includes("models.js"));
    assert.match(files["index.ts"], /return client;/);
    const dir = writeSdk(files);
    try {
      assert.strictEqual(typeCheck(dir), "");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @test
  async namesTypesFromTheirRefs() {
    assert.strictEqual(pascalCase("SubSubProject.action.input"), "SubSubProjectActionInput");
    assert.strictEqual(pascalCase("Task.queryResult"), "TaskQueryResult");
    assert.strictEqual(
      pascalCase("StoredBinaryInfo<{ width: number; height: number; }>"),
      "StoredBinaryInfoWidthNumberHeightNumber"
    );
    assert.strictEqual(pascalCase("1abc"), "_1abc");
    assert.deepStrictEqual(splitRef("WebdaDemo/Task.queryResult"), {
      namespace: "WebdaDemo",
      name: "Task.queryResult"
    });
    assert.deepStrictEqual(splitRef("searchRequest"), { name: "searchRequest" });
    assert.deepStrictEqual(splitRef("Record<string, any>"), { name: "Record<string, any>" });
    const names = assignNames(["WebdaDemo/Task", "Other/Task", "task", "Task.input"], ["Client"]);
    assert.strictEqual(names.get("WebdaDemo/Task"), "WebdaDemoTask");
    assert.strictEqual(names.get("Other/Task"), "OtherTask");
    // Without a namespace to prefix, the plain ref keeps the short name the others left
    assert.strictEqual(names.get("task"), "Task");
    assert.strictEqual(names.get("Task.input"), "TaskInput");
    assert.strictEqual(assignNames(["App/Client"]).get("App/Client"), "Client");
    assert.strictEqual(assignNames(["App/Client"], ["Client"]).get("App/Client"), "AppClient");
    assert.strictEqual(assignNames(["client"], ["Client"]).get("client"), "Client2");
  }

  @test
  async rewritesRefsAndDropsLocalDefinitions() {
    const names = new Map([
      ["WebdaDemo/Task", "Task"],
      ["Promise<any>", "PromiseAny"]
    ]);
    const rewritten = rewriteSchema(
      {
        $schema: "x",
        definitions: { local: {} },
        properties: {
          task: { $ref: "#/definitions/WebdaDemo/Task" },
          promise: { $ref: "#/definitions/Promise%3Cany%3E", description: "kept" },
          unknown: { $ref: "#/definitions/Nope" },
          list: { type: "array", items: { $ref: "#/components/schemas/WebdaDemo/Task" } },
          values: { enum: [{ $ref: "literal" }] }
        },
        required: ["task"]
      } as any,
      names
    );
    assert.deepStrictEqual(rewritten, {
      properties: {
        task: { $ref: "#/definitions/Task" },
        promise: { description: "kept", $ref: "#/definitions/PromiseAny" },
        unknown: { tsType: "unknown" },
        list: { type: "array", items: { $ref: "#/definitions/Task" } },
        values: { enum: [{ $ref: "literal" }] }
      },
      required: ["task"]
    });
  }

  @test
  async keepsTheNamespaceOnColliding() {
    const manifest: SdkManifest = {
      version: 1,
      namespace: "App",
      operations: {},
      models: {},
      schemas: { "App/Task": { type: "object" }, "Other/Task": { type: "object" } },
      transports: {}
    };
    const names = generatorNames(manifest);
    assert.strictEqual(names.types.get("App/Task"), "AppTask");
    assert.strictEqual(names.types.get("Other/Task"), "OtherTask");
    const files = await generateSdk(manifest);
    assert.match(files["types.ts"], /export interface AppTask/);
    assert.match(files["types.ts"], /export interface OtherTask/);
  }
}
