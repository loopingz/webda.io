import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateConfigurationSchemas } from "./configuration.js";

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
