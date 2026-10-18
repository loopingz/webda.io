import { suite, test } from "@webda/test";
import { FileUtils } from "@webda/utils";
import * as assert from "assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { ConfigSchemaApplication, generateConfigurationSchemas } from "./configuration.js";

import { describe, it, expect } from "vitest";
import { join } from "node:path";

const policySchema = {
  type: "object",
  properties: { options: { $ref: "#/definitions/Options" } },
  required: ["options"],
  definitions: { Options: { type: "object", properties: { limit: { type: "number" } } } }
};

describe("model configuration schemas", () => {
  it("exposes model and behavior parameter schemas with isolated references in applications and deployments", () => {
    const folder = mkdtempSync(join(tmpdir(), "webda-model-config-"));
    const app: any = {
      getModdas: () => ({ "Test/Service": {} }),
      getDeployers: () => ({}),
      getSchema: () => ({ type: "object", properties: { type: { type: "string" } } }),
      getConfiguration: () => ({ services: {} }),
      completeNamespace: (id: string) => id,
      getModules: () => ({
        models: {
          "Test/User": {
            Schema: policySchema,
            Relations: {
              behaviors: [
                { attribute: "mfa", behavior: "Test/MFA" },
                { attribute: "plain", behavior: "Test/Plain" }
              ]
            }
          },
          "Test/Plain": {},
          "Test-App/User": { Schema: { type: "object", properties: { lifetime: { type: "number" } } } },
          "Test_App/User": { Schema: policySchema }
        },
        behaviors: { "Test/MFA": { Schema: policySchema } }
      })
    };
    try {
      for (const full of [false, true]) {
        const config = join(folder, "config.json");
        const deployment = join(folder, "deployment.json");
        generateConfigurationSchemas(app, config, deployment, full);
        const schema = JSON.parse(readFileSync(config, "utf8"));
        const user = schema.properties.models.properties["Test/User"].properties;
        expect(user.parameters.properties.options.$ref).toBe("#/definitions/Parameters$546573742f55736572$Options");
        expect(user.behaviors.properties.mfa.properties.options.$ref).toBe(
          "#/definitions/Parameters$546573742f557365722f6d6661$Options"
        );
        expect(schema.definitions["Parameters$546573742f557365722f6d6661$Options"].properties.limit.type).toBe(
          "number"
        );
        expect(user.parameters.required).toEqual(full ? ["options"] : undefined);
        expect(user.behaviors.properties.plain.additionalProperties).toBe(true);
        expect(schema.properties.models.properties["Test/Plain"].properties.parameters.additionalProperties).toBe(true);
        const deployed = JSON.parse(readFileSync(deployment, "utf8"));
        expect(deployed.properties.models).toEqual(schema.properties.models);
      }
      app.getModules = () => ({});
      generateConfigurationSchemas(app, join(folder, "empty.json"), join(folder, "empty-deployment.json"));
      expect(JSON.parse(readFileSync(join(folder, "empty.json"), "utf8")).properties.models.properties).toEqual({});
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

function createMockApp(): ConfigSchemaApplication {
  return {
    getModdas: () => ({
      "Test/MyService": {
        Schema: {
          type: "object",
          properties: {
            type: { type: "string" },
            apiKey: { type: "string" }
          }
        }
      }
    }),
    getSchema: (_type: string) => ({
      type: "object",
      properties: {
        type: { type: "string" },
        apiKey: { type: "string" }
      }
    }),
    getDeployers: () => ({
      "Test/MyDeployer": {
        Schema: {
          type: "object",
          properties: {
            type: { type: "string" },
            region: { type: "string" }
          }
        }
      }
    }),
    getConfiguration: () => ({
      services: {
        myService: { type: "Test/MyService" }
      }
    }),
    getModules: () => ({
      beans: {
        "Test/MyBean": {
          Schema: {
            title: "myBean",
            type: "object",
            properties: {
              type: { type: "string" }
            }
          }
        }
      }
    }),
    completeNamespace: (name: string) => (name.includes("/") ? name : `Test/${name}`)
  };
}

@suite
class ConfigurationSchemaTest {
  private tempDir: string;

  beforeEach() {
    this.tempDir = mkdtempSync(path.join(tmpdir(), "webda-config-schema-test-"));
  }

  afterEach() {
    if (existsSync(this.tempDir)) {
      rmSync(this.tempDir, { recursive: true, force: true });
    }
  }

  @test
  generatesConfigAndDeploymentSchemas() {
    const app = createMockApp();
    const configSchemaPath = path.join(this.tempDir, ".webda", "config.schema.json");
    const deploymentSchemaPath = path.join(this.tempDir, ".schemas", "deployment.schema.json");

    generateConfigurationSchemas(app, configSchemaPath, deploymentSchemaPath);

    assert.ok(existsSync(configSchemaPath), "config.schema.json should exist");
    assert.ok(existsSync(deploymentSchemaPath), "deployment.schema.json should exist");

    const configSchema = FileUtils.load(configSchemaPath);
    assert.strictEqual(configSchema.properties.$schema.type, "string");
    assert.ok(configSchema.definitions.ServicesType);

    const deploymentSchema = FileUtils.load(deploymentSchemaPath);
    assert.strictEqual(deploymentSchema.properties.$schema.type, "string");
    assert.ok(deploymentSchema.properties.services);
    assert.ok(deploymentSchema.properties.units);
  }

  @test
  autoAddsSchemaToConfigFileIfNotPresent() {
    const app = createMockApp();
    const configPath = path.join(this.tempDir, "webda.config.json");
    writeFileSync(configPath, JSON.stringify({ version: 4, services: { test: { type: "Test" } } }, null, 2));

    const configSchemaPath = path.join(this.tempDir, ".webda", "config.schema.json");
    const deploymentSchemaPath = path.join(this.tempDir, ".webda", "deployment.schema.json");

    generateConfigurationSchemas(app, configSchemaPath, deploymentSchemaPath, false, configPath);

    const updated = FileUtils.load(configPath);
    assert.strictEqual(updated.$schema, ".webda/config.schema.json");
    assert.strictEqual(updated.version, 4);

    // Verify $schema is the first key in the file
    const raw = readFileSync(configPath, "utf-8");
    const firstKey = Object.keys(JSON.parse(raw))[0];
    assert.strictEqual(firstKey, "$schema");
  }

  @test
  preservesExistingSchemaInConfigFile() {
    const app = createMockApp();
    const configPath = path.join(this.tempDir, "webda.config.json");
    const customSchema = "https://example.com/custom-schema.json";
    writeFileSync(configPath, JSON.stringify({ $schema: customSchema, version: 4 }, null, 2));

    const configSchemaPath = path.join(this.tempDir, ".webda", "config.schema.json");
    const deploymentSchemaPath = path.join(this.tempDir, ".webda", "deployment.schema.json");

    generateConfigurationSchemas(app, configSchemaPath, deploymentSchemaPath, false, configPath);

    const updated = FileUtils.load(configPath);
    assert.strictEqual(updated.$schema, customSchema);
  }

  @test
  autoAddsSchemaToDeploymentFilesIfNotPresent() {
    const app = createMockApp();
    const configPath = path.join(this.tempDir, "webda.config.json");
    writeFileSync(configPath, JSON.stringify({ version: 4 }, null, 2));

    const deploymentsDir = path.join(this.tempDir, "deployments");
    mkdirSync(deploymentsDir, { recursive: true });

    const devJson = path.join(deploymentsDir, "Dev.json");
    writeFileSync(devJson, JSON.stringify({ parameters: { env: "dev" } }, null, 2));

    const prodJsonc = path.join(deploymentsDir, "Prod.jsonc");
    writeFileSync(prodJsonc, '{\n  // Production deployment\n  "parameters": { "env": "prod" }\n}\n');

    const alreadyHasSchema = path.join(deploymentsDir, "Staging.json");
    writeFileSync(alreadyHasSchema, JSON.stringify({ $schema: "custom-staging-schema.json", parameters: {} }, null, 2));

    const nonJson = path.join(deploymentsDir, "notes.txt");
    writeFileSync(nonJson, "some deployment notes");

    const configSchemaPath = path.join(this.tempDir, ".webda", "config.schema.json");
    const deploymentSchemaPath = path.join(this.tempDir, ".webda", "deployment.schema.json");

    generateConfigurationSchemas(app, configSchemaPath, deploymentSchemaPath, false, configPath, deploymentsDir);

    // Dev.json should get $schema
    const dev = FileUtils.load(devJson);
    assert.strictEqual(dev.$schema, "../.webda/deployment.schema.json");
    assert.strictEqual(dev.parameters.env, "dev");
    const devRaw = readFileSync(devJson, "utf-8");
    assert.strictEqual(Object.keys(JSON.parse(devRaw))[0], "$schema");

    // Prod.jsonc should get $schema
    const prod = FileUtils.load(prodJsonc);
    assert.strictEqual(prod.$schema, "../.webda/deployment.schema.json");
    assert.strictEqual(prod.parameters.env, "prod");

    // Staging.json should preserve its existing schema
    const staging = FileUtils.load(alreadyHasSchema);
    assert.strictEqual(staging.$schema, "custom-staging-schema.json");

    // notes.txt should not be touched
    assert.strictEqual(readFileSync(nonJson, "utf-8"), "some deployment notes");
  }

  @test
  autoDiscoversDeploymentsDirFromConfigFile() {
    const app = createMockApp();
    const configPath = path.join(this.tempDir, "webda.config.json");
    writeFileSync(configPath, JSON.stringify({ version: 4 }, null, 2));

    const deploymentsDir = path.join(this.tempDir, "deployments");
    mkdirSync(deploymentsDir, { recursive: true });

    const devJson = path.join(deploymentsDir, "Dev.json");
    writeFileSync(devJson, JSON.stringify({ parameters: { env: "dev" } }, null, 2));

    const configSchemaPath = path.join(this.tempDir, ".webda", "config.schema.json");
    const deploymentSchemaPath = path.join(this.tempDir, ".webda", "deployment.schema.json");

    // Omit deploymentsDir argument - it should default to join(dirname(configPath), "deployments")
    generateConfigurationSchemas(app, configSchemaPath, deploymentSchemaPath, false, configPath);

    const dev = FileUtils.load(devJson);
    assert.strictEqual(dev.$schema, "../.webda/deployment.schema.json");
  }

  @test
  resolvesRelativeSchemaPathsFromTheProjectAndLeavesExistingFilesUntouched() {
    const configPath = path.join(this.tempDir, "webda.config.json");
    const deploymentsDir = path.join(this.tempDir, "deployments");
    mkdirSync(deploymentsDir);
    writeFileSync(configPath, '{"version":4}');
    const deploymentPath = path.join(deploymentsDir, "Dev.json");
    writeFileSync(deploymentPath, '{"parameters":{}}');

    generateConfigurationSchemas(
      createMockApp(),
      ".webda/config.schema.json",
      ".webda/deployment.schema.json",
      false,
      configPath,
      "deployments"
    );

    assert.ok(existsSync(path.join(this.tempDir, ".webda", "config.schema.json")));
    assert.ok(existsSync(path.join(this.tempDir, ".webda", "deployment.schema.json")));
    assert.strictEqual(FileUtils.load(configPath).$schema, ".webda/config.schema.json");
    assert.strictEqual(FileUtils.load(deploymentPath).$schema, "../.webda/deployment.schema.json");

    const updatedConfig = readFileSync(configPath, "utf-8");
    const updatedDeployment = readFileSync(deploymentPath, "utf-8");
    generateConfigurationSchemas(
      createMockApp(),
      ".webda/config.schema.json",
      ".webda/deployment.schema.json",
      false,
      configPath
    );
    assert.strictEqual(readFileSync(configPath, "utf-8"), updatedConfig);
    assert.strictEqual(readFileSync(deploymentPath, "utf-8"), updatedDeployment);
  }

  @test
  ignoresUnparseableConfigAndDeploymentFiles() {
    const configPath = path.join(this.tempDir, "webda.config.json");
    const deploymentsDir = path.join(this.tempDir, "deployments");
    mkdirSync(deploymentsDir);
    const deploymentPath = path.join(deploymentsDir, "Broken.json");
    writeFileSync(configPath, "{");
    writeFileSync(deploymentPath, "{");

    generateConfigurationSchemas(
      createMockApp(),
      path.join(this.tempDir, ".webda", "config.schema.json"),
      path.join(this.tempDir, ".webda", "deployment.schema.json"),
      false,
      configPath
    );

    assert.strictEqual(readFileSync(configPath, "utf-8"), "{");
    assert.strictEqual(readFileSync(deploymentPath, "utf-8"), "{");
  }
}
