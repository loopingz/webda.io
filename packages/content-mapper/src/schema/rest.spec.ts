import { describe, expect, it, vi } from "vitest";
import { bindActionRest } from "./rest.ts";
import type { JSONSchema7 } from "./types.ts";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openSession } from "../context.ts";
import { generateTopLevelSchemas } from "./project.ts";
import { actionRestOption, literalOption } from "./rest.ts";
import * as restBindings from "./rest.ts";
import * as is from "typescript/unstable/ast/is";
import { SyntaxKind, type Node } from "typescript/unstable/ast";
import { buildBehaviorActions, buildModelActions } from "../module.ts";

describe("REST binding validation", () => {
  it("reads literal options without evaluating spreads, computed keys or dynamic values", () => {
    const dir = mkdtempSync(join(tmpdir(), "webda-rest-literals-"));
    try {
      writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["options.ts"] }));
      writeFileSync(
        join(dir, "options.ts"),
        `
        const dynamic: any = {};
        export const options = { count: 2, enabled: true, disabled: false, values: ["GET"], ...dynamic,
          [dynamic]: 1, skipped: dynamic };
        class Endpoints {
          @Action({rest: false}) disabled() {}
          @Action({methods: []}) empty() {}
          @Action({methods: ["GET"]}) legacy() {}
          @Action({rest: {path: "list"}}) defaultVerb() {}
          @Action({rest: {path: "list"}, methods: ["DELETE"]}) inheritedVerb() {}
          @Other() @Bare plain() {}
          @Action unknownArgument() {}
          @Action({methods: dynamic, rest: dynamic, openapi: dynamic}) ignoredOptions() {}
        }
      `
      );
      const session = openSession(join(dir, "tsconfig.json"), dir);
      try {
        const source = session.ctx.sourceFiles.find(file => file.fileName.endsWith("options.ts"))!;
        const declaration: any = source.statements
          .filter(is.isVariableStatement)
          .flatMap(statement => statement.declarationList.declarations)
          .find(declaration => (declaration.name as any).text === "options");
        expect(literalOption(declaration.initializer)).toEqual({
          count: 2,
          enabled: true,
          disabled: false,
          values: ["GET"]
        });
        const cls = source.statements.find(is.isClassDeclaration)!;
        const options = Object.fromEntries(
          cls.members
            .filter(is.isMethodDeclaration)
            .map(method => [(method.name as any).text, actionRestOption(method)])
        );
        expect(options).toEqual({
          disabled: undefined,
          empty: undefined,
          legacy: { method: "GET", methods: ["GET"] },
          defaultVerb: { path: "list", method: "put", methods: undefined },
          inheritedVerb: { path: "list", method: "DELETE", methods: ["DELETE"] },
          plain: undefined,
          unknownArgument: undefined,
          ignoredOptions: undefined
        });
        expect(buildModelActions(session.ctx, cls).ignoredOptions).toEqual({});
        expect(buildBehaviorActions(session.ctx, cls, "Test/Endpoints").ignoredOptions).toEqual({});
        expect(actionRestOption({} as any)).toBeUndefined();
      } finally {
        session.dispose();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects malformed templates, duplicate catch-alls and unresolved scalar references", () => {
    expect(() => bindActionRest({}, { path: "broken/{" })).toThrow(/Malformed/);
    expect(() => bindActionRest({ properties: { a: {}, b: {} } }, { path: "{?a*,b*}" })).toThrow(/only one/);
    for (const definitions of [undefined, {}]) {
      expect(() =>
        bindActionRest(
          { properties: { value: { $ref: "#/definitions/Unknown" } }, definitions },
          {
            path: "{value}"
          }
        )
      ).toThrow(/must be scalar/);
    }
    expect(bindActionRest({}, { route: "." })["x-webda-rest"]).toMatchObject({ template: ".", body: [] });
  });
  it("ignores dynamic options and validates every declared HTTP method", () => {
    expect(literalOption({ kind: SyntaxKind.Identifier, text: "dynamic" } as Node)).toBeUndefined();
    const schema: JSONSchema7 = { properties: { value: { type: "number" } } };
    bindActionRest(schema, { method: "post", methods: ["POST", "GET"] });
    expect(schema["x-webda-rest"]).toMatchObject({ method: "post", body: ["value"] });
    expect(() =>
      bindActionRest(
        { properties: { value: { type: "object" } } },
        {
          method: "post",
          methods: ["POST", "GET"]
        }
      )
    ).toThrow(/value.*must be scalar/);
  });

  it.each([
    ["@Action() run(uuid: string) {}", /Test\/Task.run: parameter "uuid" conflicts with the object primary key/],
    [
      '@Action({ rest: { method: "get", path: "{missing}" } }) run(value: string) {}',
      /Test\/Task.run: REST template parameter "missing" does not match/
    ],
    ['@Action({rest: {path: "{value}"}}) run(value: string) {}', /Test\/Task.run: external failure/, true]
  ])("reports the model and method on invalid bindings: %s", (method, message, externalFailure) => {
    const dir = mkdtempSync(join(tmpdir(), "webda-rest-validation-"));
    const modelSource = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "models", "src", "index.ts");
    try {
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "esnext", module: "nodenext", skipLibCheck: true },
          include: ["task.ts"]
        })
      );
      writeFileSync(
        join(dir, "task.ts"),
        `
        import { UuidModel } from ${JSON.stringify(modelSource)};
        function Action(options?: any) { return (value: any) => value; }
        export class Task extends UuidModel { ${method} }
      `
      );
      const session = openSession(join(dir, "tsconfig.json"), dir);
      try {
        if (externalFailure)
          vi.spyOn(restBindings, "bindActionRest").mockImplementationOnce(() => {
            throw "external failure";
          });
        expect(() =>
          generateTopLevelSchemas(session.ctx, {
            appPath: dir,
            rootDir: dir,
            outDir: join(dir, "lib"),
            namespace: "Test"
          })
        ).toThrow(message);
      } finally {
        vi.restoreAllMocks();
        session.dispose();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows implicit model primary keys and records the body and URL fields", () => {
    const input: JSONSchema7 = {
      type: "object",
      properties: { name: { type: "string" }, notify: { type: "boolean" } },
      required: ["name"]
    };
    bindActionRest(input, { method: "post", path: "{tenant}/{slug}/assign{?notify?}" }, ["tenant", "slug"]);
    expect(input["x-webda-rest"]).toEqual({
      method: "post",
      template: "{tenant}/{slug}/assign{?notify?}",
      path: ["tenant", "slug"],
      query: [{ name: "notify", required: false }],
      body: ["name"]
    });
  });

  it("rejects unknown template names and parameters bound twice", () => {
    const input: JSONSchema7 = { properties: { name: { type: "string" } } };
    expect(() => bindActionRest(input, { path: "{typo}" })).toThrow(/typo.*does not match/);
    expect(() => bindActionRest(input, { path: "{name}{?name}" })).toThrow(/more than once/);
    expect(() => bindActionRest(input, { path: "{?name}/suffix" })).toThrow(/must be last/);
  });

  it("rejects objects and implicit arrays on verbs with no body", () => {
    for (const method of ["get", "delete"]) {
      for (const property of [{ type: "object" }, { type: "array", items: { type: "string" } }]) {
        expect(() =>
          bindActionRest({ properties: { value: property } } as JSONSchema7, { method, path: "values" })
        ).toThrow(/value.*must be scalar/);
      }
    }
    expect(() =>
      bindActionRest({ properties: { value: { type: "object" } } }, { method: "post", path: "{value}" })
    ).toThrow(/value.*must be scalar/);
  });

  it("accepts explicit scalar arrays and catch-all scalar objects, resolving named types", () => {
    const input: JSONSchema7 = {
      properties: {
        tags: { type: "array", items: { type: "number" } },
        filters: { $ref: "#/definitions/Filters%3CT%3E" }
      },
      definitions: {
        "Filters<T>": {
          type: "object",
          properties: { active: { type: "boolean" } },
          additionalProperties: { type: "number" }
        }
      }
    };
    bindActionRest(input, { method: "get", path: "values{?tags?,filters*}" });
    expect((input["x-webda-rest"] as any).query[1]).toEqual({ name: "filters", required: false, catchAll: true });
    expect(() =>
      bindActionRest(
        { properties: { filters: { type: "object", properties: { nested: { type: "object" } } } } },
        { path: "{?filters*}" }
      )
    ).toThrow(/object of scalar/);
  });

  it("requires an unambiguous whole-body parameter", () => {
    const input: JSONSchema7 = { properties: { payload: { type: "object" }, other: { type: "string" } } };
    expect(() => bindActionRest(input, { method: "post", body: "payload" })).toThrow(/only body parameter/);
    expect(() => bindActionRest(input, { method: "get", body: "payload" })).toThrow(/POST\/PUT\/PATCH/);
    bindActionRest(input, { method: "post", path: "{other}", body: "payload" });
    expect((input["x-webda-rest"] as any).bodyParameter).toBe("payload");
  });

  it("validates catch-all records without named properties", () => {
    const input: JSONSchema7 = {
      properties: { filters: { type: "object", additionalProperties: { type: "number" } } }
    };
    bindActionRest(input, { method: "get", path: "{?filters*}" });
    expect((input["x-webda-rest"] as any).query).toEqual([{ name: "filters", required: false, catchAll: true }]);
    for (const value of [{ type: "string" }, { type: "object", additionalProperties: { type: "object" } }]) {
      expect(() =>
        bindActionRest({ properties: { filters: value } } as JSONSchema7, {
          method: "get",
          path: "{?filters*}"
        })
      ).toThrow(/object of scalar/);
    }
  });
});
