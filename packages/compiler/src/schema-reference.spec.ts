import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigSchemaApplication,
  ensureSchemaReference,
  generateConfigurationSchemas,
  listDeploymentFiles
} from "./configuration.js";

/**
 * Minimal application used to generate the schemas
 * @param config - the application configuration
 * @returns the application
 */
function getApplication(config: any = { services: {} }): ConfigSchemaApplication {
  return {
    getModdas: () => ({}),
    getSchema: () => undefined,
    getDeployers: () => ({}),
    getConfiguration: () => config,
    getModules: () => ({ beans: {} }),
    completeNamespace: (name: string) => (name.includes("/") ? name : `Webda/${name}`)
  };
}

@suite
class SchemaReferenceTest {
  dir: string;

  beforeEach() {
    this.dir = mkdtempSync(join(tmpdir(), "webda-schema-"));
    mkdirSync(join(this.dir, ".webda"));
    mkdirSync(join(this.dir, "deployments"));
  }

  afterEach() {
    rmSync(this.dir, { recursive: true, force: true });
  }

  read(file: string): string {
    return readFileSync(join(this.dir, file), "utf-8");
  }

  @test
  addSchemaToConfigAndDeployments() {
    writeFileSync(join(this.dir, "webda.config.json"), JSON.stringify({ version: 4, services: {} }, undefined, 2));
    writeFileSync(join(this.dir, "deployments", "Production.json"), '{\n "parameters": { "a": 1 }\n}\n');
    writeFileSync(join(this.dir, "deployments", "Dev.jsonc"), '{\n  // dev deployment\n  "units": []\n}\n');
    writeFileSync(join(this.dir, "deployments", "Staging.yaml"), "# staging\nparameters:\n  a: 1 # inline\n");
    writeFileSync(join(this.dir, "deployments", "README.md"), "Not a deployment");

    generateConfigurationSchemas(
      getApplication(),
      join(this.dir, ".webda", "config.schema.json"),
      join(this.dir, ".webda", "deployment.schema.json"),
      false,
      join(this.dir, "webda.config.json"),
      join(this.dir, "deployments")
    );

    assert.strictEqual(JSON.parse(this.read("webda.config.json")).$schema, ".webda/config.schema.json");
    const production = JSON.parse(this.read("deployments/Production.json"));
    assert.strictEqual(production.$schema, "../.webda/deployment.schema.json");
    assert.deepStrictEqual(production.parameters, { a: 1 });
    // Formatting of plain JSON is kept and $schema is the first property
    assert.strictEqual(
      this.read("deployments/Production.json"),
      '{\n "$schema": "../.webda/deployment.schema.json",\n "parameters": { "a": 1 }\n}\n'
    );
    // Comments are kept and $schema is the first property
    const dev = this.read("deployments/Dev.jsonc");
    assert.ok(dev.includes("// dev deployment"));
    assert.ok(dev.indexOf('"$schema": "../.webda/deployment.schema.json"') < dev.indexOf('"units"'));
    // YAML uses the yaml-language-server modeline
    assert.strictEqual(
      this.read("deployments/Staging.yaml"),
      "# yaml-language-server: $schema=../.webda/deployment.schema.json\n# staging\nparameters:\n  a: 1 # inline\n"
    );
    assert.strictEqual(this.read("deployments/README.md"), "Not a deployment");
    // Deployment schema accepts the $schema property
    const schema = JSON.parse(this.read(".webda/deployment.schema.json"));
    assert.deepStrictEqual(schema.properties.$schema, { type: "string" });
  }

  @test
  idempotent() {
    const file = join(this.dir, "deployments", "Production.json");
    const schema = join(this.dir, ".webda", "deployment.schema.json");
    writeFileSync(file, "{}");
    assert.strictEqual(ensureSchemaReference(file, schema), true);
    const content = readFileSync(file, "utf-8");
    assert.strictEqual(ensureSchemaReference(file, schema), false);
    assert.strictEqual(readFileSync(file, "utf-8"), content);

    const yaml = join(this.dir, "deployments", "Staging.yml");
    writeFileSync(yaml, "parameters: {}\n");
    assert.strictEqual(ensureSchemaReference(yaml, schema), true);
    assert.strictEqual(ensureSchemaReference(yaml, schema), false);
  }

  @test
  updateManagedReferences() {
    const schema = join(this.dir, ".webda", "deployment.schema.json");
    // Legacy webda schema name
    const legacy = join(this.dir, "deployments", "Legacy.json");
    writeFileSync(legacy, JSON.stringify({ $schema: "../.webda-deployment-schema.json" }));
    assert.strictEqual(ensureSchemaReference(legacy, schema), true);
    assert.strictEqual(JSON.parse(readFileSync(legacy, "utf-8")).$schema, "../.webda/deployment.schema.json");
    // Stale path in JSONC, only the reference is replaced
    const staleJson = join(this.dir, "deployments", "Stale.jsonc");
    writeFileSync(staleJson, '{\n  // comment\n  "$schema" : "deployment.schema.json",\n  "units": []\n}');
    assert.strictEqual(ensureSchemaReference(staleJson, schema), true);
    assert.strictEqual(
      readFileSync(staleJson, "utf-8"),
      '{\n  // comment\n  "$schema" : "../.webda/deployment.schema.json",\n  "units": []\n}'
    );
    // Stale path to the generated schema
    const stale = join(this.dir, "deployments", "Stale.yaml");
    writeFileSync(stale, "# yaml-language-server: $schema=.webda/deployment.schema.json\nunits: []\n");
    assert.strictEqual(ensureSchemaReference(stale, schema), true);
    assert.strictEqual(
      readFileSync(stale, "utf-8"),
      "# yaml-language-server: $schema=../.webda/deployment.schema.json\nunits: []\n"
    );
  }

  @test
  keepCustomReferences() {
    const schema = join(this.dir, ".webda", "deployment.schema.json");
    const json = join(this.dir, "deployments", "Custom.json");
    writeFileSync(json, JSON.stringify({ $schema: "https://example.com/my.schema.json" }));
    assert.strictEqual(ensureSchemaReference(json, schema), false);
    assert.strictEqual(JSON.parse(readFileSync(json, "utf-8")).$schema, "https://example.com/my.schema.json");

    const yaml = join(this.dir, "deployments", "Custom.yaml");
    writeFileSync(yaml, "# yaml-language-server: $schema=./custom.json\n");
    assert.strictEqual(ensureSchemaReference(yaml, schema), false);
    // Invalid or non-object documents are ignored
    const invalid = join(this.dir, "deployments", "Invalid.json");
    writeFileSync(invalid, "{ invalid");
    assert.strictEqual(ensureSchemaReference(invalid, schema), false);
    assert.strictEqual(readFileSync(invalid, "utf-8"), "{ invalid");
    const array = join(this.dir, "deployments", "Array.json");
    writeFileSync(array, "[]");
    assert.strictEqual(ensureSchemaReference(array, schema), false);
  }

  @test
  insertKeepsFormatting() {
    const schema = join(this.dir, ".webda", "deployment.schema.json");
    const cases: [string, string][] = [
      ["{}", '{ "$schema": "../.webda/deployment.schema.json" }'],
      ['{"a":1}', '{"$schema": "../.webda/deployment.schema.json","a":1}'],
      [
        '/* header */\r\n{\r\n\t"a": 1\r\n}\r\n',
        '/* header */\r\n{\r\n\t"$schema": "../.webda/deployment.schema.json",\r\n\t"a": 1\r\n}\r\n'
      ],
      [
        '{\n    "a": {\n        "b": 1\n        }\n}',
        '{\n    "$schema": "../.webda/deployment.schema.json",\n    "a": {\n        "b": 1\n        }\n}'
      ]
    ];
    const file = join(this.dir, "deployments", "Format.jsonc");
    for (const [input, expected] of cases) {
      writeFileSync(file, input);
      assert.strictEqual(ensureSchemaReference(file, schema), true);
      assert.strictEqual(readFileSync(file, "utf-8"), expected);
    }
  }

  @test
  listDeployments() {
    assert.deepStrictEqual(listDeploymentFiles(join(this.dir, "unknown")), []);
    writeFileSync(join(this.dir, "deployments", "B.yml"), "");
    writeFileSync(join(this.dir, "deployments", "A.json"), "{}");
    writeFileSync(join(this.dir, "deployments", "notes.txt"), "");
    mkdirSync(join(this.dir, "deployments", "sub.json"));
    assert.deepStrictEqual(listDeploymentFiles(join(this.dir, "deployments")), [
      join(this.dir, "deployments", "A.json"),
      join(this.dir, "deployments", "B.yml")
    ]);
  }
}
