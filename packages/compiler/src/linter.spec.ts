import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintConfiguration, lintModule, lintProject, mergeDependencyModules } from "./linter.js";
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

    it("lints a full project with dependencies, config, deployments, and untyped operations", () => {
      const dir = mkdtempSync(join(tmpdir(), "webda-lint-"));
      try {
        writeFileSync(
          join(dir, "package.json"),
          JSON.stringify({ name: "my-app", version: "1.0.0", webda: { namespace: "MyApp" } })
        );
        // Dependency module in node_modules/@webda/core
        const depDir = join(dir, "node_modules", "@webda", "core");
        mkdirSync(depDir, { recursive: true });
        mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
        writeFileSync(join(dir, "node_modules", "file.txt"), "ignore");
        writeFileSync(
          join(depDir, "webda.module.json"),
          JSON.stringify({
            moddas: {
              "Webda/MemoryStore": { label: "MemoryStore", Schema: { type: "object", properties: {} } }
            },
            models: {},
            deployers: {},
            schemas: {},
            capabilities: { rest: true }
          })
        );
        // Symlink to dependency to exercise symlink branch
        symlinkSync(depDir, join(dir, "node_modules", "linked-core"));
        // Broken symlink to exercise catch branch
        symlinkSync(join(dir, "does-not-exist"), join(dir, "node_modules", "broken-link"));

        // Local webda.module.json with an untyped operation
        writeFileSync(
          join(dir, "webda.module.json"),
          JSON.stringify({
            moddas: {},
            beans: {
              "MyApp/Worker": { label: "Worker" }
            },
            models: {
              "MyApp/Task": {
                Plural: "Tasks",
                Actions: {
                  create: {},
                  doThing: { global: true }
                }
              }
            },
            schemas: {
              "MyApp/Task.doThing.input": { type: "object" }
            },
            deployers: {}
          })
        );

        // Main config
        writeFileSync(
          join(dir, "webda.config.jsonc"),
          JSON.stringify({
            version: 4,
            services: {
              invalidEntry: null,
              tasks: {
                type: "MemoryStore",
                models: ["Task", 123]
              }
            }
          })
        );

        // Deployments directory (override + non-json + invalid json)
        mkdirSync(join(dir, "deployments"), { recursive: true });
        writeFileSync(join(dir, "deployments", "readme.txt"), "ignore");
        writeFileSync(join(dir, "deployments", "broken.json"), "{ invalid json");
        writeFileSync(
          join(dir, "deployments", "prod.json"),
          JSON.stringify({
            services: {
              tasks: { type: "UnknownProdStore" }
            }
          })
        );

        const result = lintProject(dir);
        expect(result.errors).toBe(0);
        expect(
          result.issues.some(i => i.rule === "config/unknown-service-type" && i.file === "deployments/prod.json")
        ).toBe(true);
        expect(
          result.issues.some(i => i.rule === "config/store-missing-models" && i.file === "deployments/prod.json")
        ).toBe(false);
        expect(result.issues.some(i => i.rule === "module/untyped-operation")).toBe(true);
        expect(result.issues.some(i => i.rule === "module/service-missing-schema")).toBe(true);

        // Exercise mergeDependencyModules directly
        const merged: WebdaModule = { moddas: {}, models: {}, deployers: {}, beans: {}, schemas: {} };
        mergeDependencyModules(dir, merged);
        expect(merged.moddas?.["Webda/MemoryStore"]).toBeDefined();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("handles null or non-object configurations gracefully", () => {
      expect(lintConfiguration(baseModule, null)).toEqual([]);
      expect(lintConfiguration(baseModule, { services: { bad: "string" } })).toEqual([]);
    });
  });
});
