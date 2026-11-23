import { describe, expect, it } from "vitest";
import { lintConfiguration, lintModule, lintProject } from "./linter.js";
import { WebdaModule } from "./definition.js";

describe("WebdaLinter", () => {
  const baseModule: WebdaModule = {
    moddas: {
      "Webda/MemoryStore": {
        label: "MemoryStore",
        Schema: { type: "object", properties: {} }
      } as any
    },
    beans: {
      "App/MyBean": {
        label: "MyBean",
        Schema: { type: "object", properties: {} }
      } as any
    },
    models: {
      "App/User": {
        Plural: "Users",
        Actions: {
          create: {},
          get: {}
        }
      } as any,
      "App/Orphan": {
        Plural: "Orphans",
        Actions: {}
      } as any
    },
    deployers: {},
    schemas: {}
  };

  describe("lintConfiguration", () => {
    it("reports deprecated model and additionalModels on stores", () => {
      const issues = lintConfiguration(
        baseModule,
        {
          services: {
            users: {
              type: "MemoryStore",
              model: "App/User",
              models: ["App/User"]
            }
          }
        },
        "webda.config.jsonc",
        "App"
      );
      expect(issues.some(i => i.rule === "config/no-deprecated-store-model" && i.severity === "error")).toBe(true);
    });

    it("warns when a Store has no models array", () => {
      const issues = lintConfiguration(
        baseModule,
        {
          services: {
            users: {
              type: "MemoryStore"
            }
          }
        },
        "webda.config.jsonc",
        "App"
      );
      expect(issues.some(i => i.rule === "config/store-missing-models" && i.severity === "warn")).toBe(true);
    });

    it("reports unknown model references and unknown service types", () => {
      const issues = lintConfiguration(
        baseModule,
        {
          services: {
            users: {
              type: "NonExistentStore",
              models: ["App/DoesNotExist"]
            }
          }
        },
        "webda.config.jsonc",
        "App"
      );
      expect(issues.some(i => i.rule === "config/unknown-service-type")).toBe(true);
      expect(issues.some(i => i.rule === "config/unknown-model-reference" && i.severity === "error")).toBe(true);
    });

    it("passes on valid configuration", () => {
      const issues = lintConfiguration(
        baseModule,
        {
          services: {
            users: {
              type: "MemoryStore",
              models: ["User"]
            }
          }
        },
        "webda.config.jsonc",
        "App"
      );
      expect(issues).toHaveLength(0);
    });
  });

  describe("lintModule", () => {
    it("detects orphan models not attached to any store", () => {
      const issues = lintModule(
        baseModule,
        baseModule,
        {
          services: {
            users: {
              type: "MemoryStore",
              models: ["App/User"]
            }
          }
        },
        "App"
      );
      expect(issues.some(i => i.rule === "module/orphan-model" && i.message.includes("App/Orphan"))).toBe(true);
      expect(issues.some(i => i.rule === "module/orphan-model" && i.message.includes("App/User"))).toBe(false);
    });

    it("detects services missing parameter schemas", () => {
      const modNoSchema: WebdaModule = {
        ...baseModule,
        beans: {
          "App/NoSchemaBean": { label: "NoSchemaBean" } as any
        }
      };
      const issues = lintModule(modNoSchema, modNoSchema);
      expect(
        issues.some(i => i.rule === "module/service-missing-schema" && i.message.includes("App/NoSchemaBean"))
      ).toBe(true);
    });
  });

  describe("lintProject", () => {
    it("warns when webda.module.json is missing", () => {
      const result = lintProject("/tmp/non-existent-webda-project-dir");
      expect(result.warnings).toBeGreaterThanOrEqual(1);
      expect(result.issues.some(i => i.rule === "project/missing-module")).toBe(true);
    });
  });
});
