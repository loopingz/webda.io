import { describe, expect, it } from "vitest";
import { bindRestInput, inputSchemaToOpenAPI, resolveInputSchema } from "./binding.js";

describe("REST input bindings", () => {
  it("binds path, explicit query and remaining body fields independently", () => {
    expect(
      bindRestInput(
        "/{id}{?required,optional?,filters*,extra+}",
        "POST",
        {
          properties: { id: {}, required: {}, optional: {}, filters: {}, extra: {}, payload: {} }
        },
        "payload"
      )
    ).toEqual({
      path: "/{id}{?required,optional?,filters*,extra+}",
      binding: {
        path: ["id"],
        query: [
          { name: "required", required: true },
          { name: "optional", required: false },
          { name: "filters", required: false, catchAll: true },
          { name: "extra", required: true, catchAll: true }
        ],
        body: ["payload"],
        bodyParameter: "payload"
      }
    });
  });

  it("adds GET/DELETE arguments to the query without duplicating explicit fields", () => {
    for (const method of ["GET", "DELETE"]) {
      const result = bindRestInput("/{id}{?filters*,extras+}", method, {
        properties: { id: {}, filters: {}, extras: {}, limit: {}, offset: {} },
        required: ["limit"]
      });
      expect(result.path).toBe("/{id}{?filters*,extras+,limit,offset?}");
      expect(result.binding.body).toEqual([]);
      expect(bindRestInput("/empty", method, undefined).path).toBe("/empty");
      expect(bindRestInput("/search", method, { properties: { term: {} } }).path).toBe("/search{?term?}");
    }
  });

  it("resolves escaped definition names, missing targets and cyclic references", () => {
    const scalar = { type: "string" };
    expect(
      resolveInputSchema(
        { $ref: "#/definitions/A%3CB~1C~0D%3E" },
        {
          definitions: { "A<B/C~D>": scalar }
        }
      )
    ).toBe(scalar);
    expect(
      resolveInputSchema(
        { $ref: "#/definitions/100%" },
        {
          definitions: { "100%": scalar }
        }
      )
    ).toBe(scalar);
    const missing = { $ref: "#/definitions/Missing" };
    expect(resolveInputSchema(missing, {})).toBe(missing);
    expect(resolveInputSchema(missing, undefined)).toBe(missing);
    const a = { $ref: "#/definitions/B" };
    const b = { $ref: "#/definitions/A" };
    expect(resolveInputSchema(a, { definitions: { A: a, B: b } })).toBe(a);
    expect(resolveInputSchema(undefined, {})).toBeUndefined();
  });

  it("converts schema references while preserving defaults, examples and property names", () => {
    const reference = { $ref: "#/definitions/A%3CB~1C~0D%3E" };
    const converted = { $ref: "#/components/schemas/A%3CB~1C~0D%3E" };
    const source = {
      $schema: "schema",
      definitions: { unused: {} },
      "x-webda-arguments": [],
      "x-webda-context": [],
      "x-webda-rest": {},
      properties: { definitions: reference, $schema: { type: "string" } },
      patternProperties: { "^a": reference },
      dependencies: { a: reference, b: ["a"] },
      dependentSchemas: { a: reference },
      items: reference,
      additionalItems: false,
      additionalProperties: reference,
      not: reference,
      allOf: [reference],
      anyOf: [reference],
      oneOf: [reference],
      contains: reference,
      propertyNames: reference,
      if: reference,
      then: reference,
      else: reference,
      default: { definitions: "data", $ref: "#/definitions/Data" },
      examples: [{ $schema: "data" }]
    };
    const result = inputSchemaToOpenAPI(source);
    expect(result).toEqual({
      properties: { definitions: converted, $schema: { type: "string" } },
      patternProperties: { "^a": converted },
      dependencies: { a: converted, b: ["a"] },
      dependentSchemas: { a: converted },
      items: converted,
      additionalItems: false,
      additionalProperties: converted,
      not: converted,
      allOf: [converted],
      anyOf: [converted],
      oneOf: [converted],
      contains: converted,
      propertyNames: converted,
      if: converted,
      then: converted,
      else: converted,
      default: source.default,
      examples: source.examples
    });
    expect(source.properties.definitions).toBe(reference);
    expect(inputSchemaToOpenAPI(undefined)).toEqual({});
  });
});
