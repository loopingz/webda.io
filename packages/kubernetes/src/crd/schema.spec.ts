import { suite, test } from "@webda/test";
import * as assert from "assert";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { JSONSchema7 } from "json-schema";
import { buildCrd, StructuralSchema, toStructuralSchema } from "./schema.js";

/** Keywords a structural schema node may have */
const ALLOWED = new Set([
  "type",
  "description",
  "title",
  "format",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "enum",
  "required",
  "nullable",
  "properties",
  "additionalProperties",
  "items",
  "x-kubernetes-preserve-unknown-fields",
  "x-kubernetes-int-or-string"
]);

/**
 * Check the rules of a structural schema
 * @param schema - the schema
 * @param path - path of the node, for the messages
 * @returns the violations
 */
function structuralViolations(schema: StructuralSchema, path = "#"): string[] {
  const violations: string[] = [];
  for (const key of Object.keys(schema)) {
    if (!ALLOWED.has(key)) violations.push(`${path}: ${key} not allowed`);
  }
  if (!schema.type && !schema["x-kubernetes-preserve-unknown-fields"] && !schema["x-kubernetes-int-or-string"]) {
    violations.push(`${path}: no type`);
  }
  if (schema.properties && schema.additionalProperties) {
    violations.push(`${path}: properties and additionalProperties`);
  }
  if (schema.type === "array" && !schema.items) violations.push(`${path}: array without items`);
  if (schema.type && schema.type !== "object" && (schema.properties || schema.additionalProperties)) {
    violations.push(`${path}: properties on a ${schema.type}`);
  }
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    violations.push(...structuralViolations(property, `${path}/${name}`));
  }
  if (schema.additionalProperties) {
    violations.push(...structuralViolations(schema.additionalProperties, `${path}/additionalProperties`));
  }
  if (schema.items) violations.push(...structuralViolations(schema.items, `${path}/items`));
  return violations;
}

/**
 * The models of every built webda.module.json of the repository
 * @returns model metadata by identifier
 */
function repositoryModels(): Record<string, any> {
  const packages = join(process.cwd(), "..");
  const models: Record<string, any> = {};
  for (const dir of readdirSync(packages)) {
    const file = join(packages, dir, "webda.module.json");
    if (!existsSync(file)) continue;
    Object.assign(models, JSON.parse(readFileSync(file, "utf8")).models ?? {});
  }
  return models;
}

@suite
class StructuralSchemaTest {
  @test
  inlinesReferences() {
    const schema = toStructuralSchema({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      additionalProperties: false,
      definitions: {
        Address: { type: "object", properties: { city: { type: "string" } }, additionalProperties: false },
        Node: { type: "object", properties: { child: { $ref: "#/definitions/Node" } } }
      },
      properties: {
        home: { $ref: "#/definitions/Address", description: "Home" },
        tree: { $ref: "#/definitions/Node" },
        unknown: { $ref: "#/definitions/Missing" }
      }
    });
    assert.deepStrictEqual(schema, {
      type: "object",
      properties: {
        home: { type: "object", description: "Home", properties: { city: { type: "string" } } },
        // Recursion stops with a free-form value
        tree: {
          type: "object",
          properties: { child: { "x-kubernetes-preserve-unknown-fields": true } },
          "x-kubernetes-preserve-unknown-fields": true
        },
        unknown: { "x-kubernetes-preserve-unknown-fields": true }
      }
    });
  }

  @test
  alternatives() {
    const schema = toStructuralSchema({
      type: "object",
      additionalProperties: false,
      properties: {
        optional: { anyOf: [{ type: "string" }, { type: "null" }] },
        intOrString: { oneOf: [{ type: "integer" }, { type: "string" }], description: "port" },
        mixed: { anyOf: [{ type: "string" }, { type: "object", properties: {} }] },
        types: { type: ["number", "null"] },
        intOrStringTypes: { type: ["integer", "string"] },
        merged: {
          allOf: [
            { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
            { properties: { b: { type: "boolean" } }, additionalProperties: false }
          ]
        }
      }
    });
    assert.deepStrictEqual(schema.properties, {
      optional: { type: "string", nullable: true },
      intOrString: { description: "port", "x-kubernetes-int-or-string": true },
      mixed: { "x-kubernetes-preserve-unknown-fields": true },
      types: { type: "number", nullable: true },
      intOrStringTypes: { "x-kubernetes-int-or-string": true },
      merged: {
        type: "object",
        // A branch closing the object closes the merge
        properties: { a: { type: "string" }, b: { type: "boolean" } },
        required: ["a"]
      }
    });
  }

  @test
  keywords() {
    const schema = toStructuralSchema({
      type: "object",
      additionalProperties: false,
      required: ["version", "missing"],
      properties: {
        version: { const: 1 },
        level: { enum: ["low", "high", null] },
        id: { type: "string", format: "uuid", default: "x" },
        custom: { type: "string", format: "my-format", pattern: "^a" },
        ratio: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 1 },
        tags: { type: "array", items: { type: "string" }, uniqueItems: true },
        tuple: { type: "array", items: [{ type: "string" }] },
        map: { type: "object", additionalProperties: { type: "number" } },
        free: { type: "object" },
        anything: { description: "Untyped" },
        withWebdaKeys: { type: "string", WebdaBehavior: "x" } as JSONSchema7
      }
    });
    assert.deepStrictEqual(schema, {
      type: "object",
      required: ["version"],
      properties: {
        version: { type: "integer", enum: [1] },
        level: { type: "string", enum: ["low", "high"], nullable: true },
        id: { type: "string", format: "uuid" },
        custom: { type: "string", pattern: "^a" },
        ratio: { type: "number", minimum: 0, exclusiveMinimum: true, maximum: 1, exclusiveMaximum: true },
        tags: { type: "array", items: { type: "string" } },
        tuple: { type: "array", items: { "x-kubernetes-preserve-unknown-fields": true } },
        map: { type: "object", additionalProperties: { type: "number" } },
        free: { type: "object", "x-kubernetes-preserve-unknown-fields": true },
        anything: { description: "Untyped", "x-kubernetes-preserve-unknown-fields": true },
        withWebdaKeys: { type: "string" }
      }
    });
  }

  @test
  everyRepositoryModelIsStructural() {
    const models = Object.values(repositoryModels()).filter(m => m.Schemas?.Stored);
    assert.ok(models.length > 10, "the module files of the repository are built");
    for (const model of models) {
      assert.deepStrictEqual(structuralViolations(toStructuralSchema(model.Schemas.Stored)), [], model.Identifier);
    }
  }
}

@suite
class BuildCrdTest {
  tenant = {
    Identifier: "MyApp/Tenant",
    Plural: "Tenants",
    ShortName: "Tn",
    PrimaryKey: ["uuid"],
    Schemas: {
      Stored: {
        type: "object",
        description: "A tenant",
        additionalProperties: false,
        required: ["uuid", "name", "plan"],
        properties: {
          uuid: { type: "string", format: "uuid" },
          name: { type: "string" },
          plan: { type: "string", enum: ["free", "premium"] },
          seats: { type: "integer" },
          ready: { type: "boolean" },
          readyAt: { type: "string", format: "date-time" }
        }
      } as JSONSchema7
    }
  };

  @test
  crd() {
    const crd = buildCrd(this.tenant, {
      group: "myapp.example.com",
      statusFields: ["ready", "readyAt"],
      labelFields: ["plan", "seats", "readyAt", "uuid"]
    });
    assert.deepStrictEqual(crd.metadata, {
      name: "tenants.myapp.example.com",
      annotations: { "webda.io/model": "MyApp/Tenant" }
    });
    assert.deepStrictEqual(crd.spec.names, {
      kind: "Tenant",
      listKind: "TenantList",
      plural: "tenants",
      singular: "tenant",
      shortNames: ["tn"]
    });
    assert.strictEqual(crd.spec.scope, "Namespaced");
    const [version] = crd.spec.versions;
    assert.strictEqual(version.name, "v1");
    assert.deepStrictEqual(version.subresources, { status: {} });
    assert.deepStrictEqual(version.schema.openAPIV3Schema, {
      type: "object",
      description: "A tenant",
      properties: {
        spec: {
          type: "object",
          required: ["name", "plan"],
          properties: {
            name: { type: "string" },
            plan: { type: "string", enum: ["free", "premium"] },
            seats: { type: "integer" }
          }
        },
        status: {
          type: "object",
          properties: { ready: { type: "boolean" }, readyAt: { type: "string", format: "date-time" } }
        }
      }
    });
    assert.deepStrictEqual(version.additionalPrinterColumns, [
      { name: "plan", type: "string", jsonPath: ".spec.plan" },
      { name: "seats", type: "integer", jsonPath: ".spec.seats" },
      { name: "readyAt", type: "date", jsonPath: ".status.readyAt" },
      { name: "uuid", type: "string", jsonPath: ".metadata.name" },
      { name: "Age", type: "date", jsonPath: ".metadata.creationTimestamp" }
    ]);
  }

  @test
  withoutStatus() {
    const crd = buildCrd(this.tenant, { group: "myapp.example.com", version: "v1alpha1", scope: "Cluster" });
    const [version] = crd.spec.versions;
    assert.strictEqual(version.name, "v1alpha1");
    assert.strictEqual(crd.spec.scope, "Cluster");
    assert.strictEqual(version.subresources, undefined);
    assert.strictEqual(version.additionalPrinterColumns, undefined);
    assert.deepStrictEqual(Object.keys(version.schema.openAPIV3Schema.properties!), ["spec"]);
    const preserved = buildCrd(this.tenant, { group: "myapp.example.com", preserveUnknownFields: true });
    assert.strictEqual(
      preserved.spec.versions[0].schema.openAPIV3Schema.properties!.spec["x-kubernetes-preserve-unknown-fields"],
      true
    );
  }

  @test
  invalid() {
    assert.throws(() => buildCrd(this.tenant, { group: "example" }), /Invalid API group/);
    assert.throws(() => buildCrd(this.tenant, { group: "Example.com" }), /Invalid API group/);
    assert.throws(
      () => buildCrd(this.tenant, { group: "example.com", statusFields: ["unknown"] }),
      /no stored field 'unknown'/
    );
    assert.throws(
      () => buildCrd(this.tenant, { group: "example.com", statusFields: ["uuid"] }),
      /primary key field 'uuid' cannot be a status field/
    );
    assert.throws(
      () =>
        buildCrd({ ...this.tenant, PrimaryKey: ["name", "plan"], PrimaryKeySeparator: ":" }, { group: "example.com" }),
      /PrimaryKeySeparator to '-' or '.'/
    );
    assert.throws(() => buildCrd({ ...this.tenant, Plural: "My Tenants" }, { group: "example.com" }), /Invalid name/);
    assert.throws(() => buildCrd({ ...this.tenant, Identifier: "MyApp/9" }, { group: "example.com" }), /Invalid kind/);
  }

  @test
  everyRepositoryModelHasACrd() {
    for (const model of Object.values(repositoryModels())) {
      if (!model.Schemas?.Stored || !model.Plural || model.PrimaryKey?.length !== 1) continue;
      const crd = buildCrd(model, { group: "test.webda.io" });
      assert.deepStrictEqual(structuralViolations(crd.spec.versions[0].schema.openAPIV3Schema), [], model.Identifier);
    }
  }
}
