import { describe, expect, it, vi } from "vitest";

// Models carry their metadata in `__meta` here, and the app has no service
const { createFromInput } = vi.hoisted(() => ({ createFromInput: vi.fn() }));
vi.mock("./mutations.js", async importOriginal => ({ ...(await importOriginal<any>()), createFromInput }));

vi.mock("@webda/core", async importOriginal => ({
  ...(await importOriginal<any>()),
  useModelMetadata: (model: any) => model.__meta,
  getClientWritableAttributes: () => undefined,
  useCore: () => ({ getServices: () => ({}) }),
  useInstanceStorage: () => ({ operations: {} })
}));

import {
  GraphQLBoolean,
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  graphql,
  parseValue,
  validateSchema
} from "graphql";
import { GraphQLService } from "./graphql.service.js";
import { AnyScalarType } from "./types/any.js";
import { restoreInputKeys } from "./names.js";

/**
 * @returns a service double with the converter state
 */
function service(): GraphQLService {
  const svc: GraphQLService = Object.create(GraphQLService.prototype);
  (svc as any).log = () => {};
  svc.modelsMap = {};
  svc.namedTypes = new Map();
  return svc;
}

/**
 * @returns a titled object schema
 */
const address = (): any => ({ title: "Address", type: "object", properties: { city: { type: "string" } } });

describe("GraphQL types from JSON schemas", () => {
  it("reuses a named type generated twice for the same shape", () => {
    const svc = service();
    const a = svc.getGraphQLSchemaFromSchema(address(), "A").type;
    const b = svc.getGraphQLSchemaFromSchema(address(), "B").type;
    expect(a).toBe(b);
    expect((a as GraphQLObjectType).name).toBe("Address");
  });

  it("refuses one name for two different shapes", () => {
    const svc = service();
    svc.getGraphQLSchemaFromSchema(address(), "A");
    expect(() =>
      svc.getGraphQLSchemaFromSchema({ ...address(), properties: { zip: { type: "string" } } }, "B")
    ).toThrow(/GraphQL type Address is generated for two different schemas/);
  });

  it("names a titled input type apart from its output type", () => {
    const svc = service();
    const output = svc.getGraphQLSchemaFromSchema(address(), "A").type as GraphQLObjectType;
    const input = svc.getGraphQLSchemaFromSchema(address(), "A", true).type as GraphQLInputObjectType;
    expect(input.name).toBe("AddressInput");
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({ name: "Query", fields: { a: { type: output, args: { in: { type: input } } } } })
    });
    expect(validateSchema(schema)).toEqual([]);
  });

  it("handles nullable type arrays", () => {
    const svc = service();
    expect(svc.getGraphQLSchemaFromSchema({ type: ["string", "null"] } as any, "S").type).toBe(GraphQLString);
    expect(svc.getGraphQLSchemaFromSchema({ type: ["null"] } as any, "S")).toBeUndefined();
    expect(svc.getGraphQLSchemaFromSchema({ type: ["string", "number"] } as any, "S").type).toBe(AnyScalarType);
    const object = svc.getGraphQLSchemaFromSchema(
      { type: "object", properties: { flag: { type: ["boolean", "null"] } } } as any,
      "Flags"
    ).type as GraphQLObjectType;
    expect(object.getFields().flag.type).toBe(GraphQLBoolean);
  });
});

describe("Object scalar", () => {
  it("passes values through when serializing and parsing variables", () => {
    for (const value of [1, 2.5, true, false, "text", "{not json", { a: 1 }, [1, "x"]]) {
      expect(AnyScalarType.serialize(value)).toEqual(value);
      expect(AnyScalarType.parseValue(value)).toEqual(value);
    }
    expect(AnyScalarType.serialize(undefined)).toBeNull();
  });

  it("parses literals, and reads a string literal as JSON only when it looks like JSON", () => {
    const literal = (text: string) => AnyScalarType.parseLiteral(parseValue(text), undefined);
    expect(literal('{ a: 1, b: [true, "x"] }')).toEqual({ a: 1, b: [true, "x"] });
    expect(literal('"{\\"a\\": 1}"')).toEqual({ a: 1 });
    expect(literal('"[1, 2]"')).toEqual([1, 2]);
    expect(literal('"{broken"')).toBe("{broken");
    expect(literal('"plain"')).toBe("plain");
    expect(literal("42")).toBe(42);
    expect(literal("null")).toBeNull();
  });
});

describe("GraphQL named types", () => {
  it("refuses one name and the same keys for different field types", () => {
    const svc = service();
    svc.getGraphQLSchemaFromSchema(address(), "A");
    expect(() =>
      svc.getGraphQLSchemaFromSchema({ ...address(), properties: { city: { type: "boolean" } } }, "B")
    ).toThrow(/GraphQL type Address is generated for two different schemas/);
  });

  it("registers one named type for a titled nullable object", () => {
    const svc = service();
    const a = svc.getGraphQLSchemaFromSchema({ ...address(), type: ["object", "null"] }, "A").type;
    const b = svc.getGraphQLSchemaFromSchema(address(), "B").type;
    expect(a).toBe(b);
    expect(svc.namedTypes.size).toBe(1);
  });

  it("refuses a nested titled type named like a reserved model", () => {
    const svc = service();
    svc.reserveName("Address", "model Test/Address");
    svc.reserveName("AddressInput", "model input Test/Address");
    expect(() => svc.getGraphQLSchemaFromSchema(address(), "A")).toThrow(/GraphQL type Address is generated/);
    expect(() => svc.getGraphQLSchemaFromSchema(address(), "A", true)).toThrow(
      /GraphQL type AddressInput is generated/
    );
    // The same reservation twice is the same model
    expect(() => svc.reserveName("Address", "model Test/Address")).not.toThrow();
    expect(() => svc.reserveName("Address", "model Other/Address")).toThrow(/two different schemas/);
  });

  it("generateSchema reserves model names first, whatever the order, and resets between calls", () => {
    const build = (models: string[]) => {
      const svc = service();
      const classes: any = {};
      const schemas: any = {};
      for (const m of models) {
        classes[`Test/${m}`] = { __meta: { Identifier: `Test/${m}`, Plural: `Test/${m}s`, Actions: {}, Events: [] } };
        schemas[`Test/${m}`] = {
          type: "object",
          properties: {
            uuid: { type: "string" },
            nested: { type: "object", title: "Shared", properties: { x: { type: "string" } } }
          }
        };
      }
      (svc as any).app = {
        getModels: () => classes,
        isFinalModel: () => true,
        getSchema: (i: string) => schemas[i]
      };
      (svc as any).parameters = { isIncluded: () => true, exposeMe: false };
      (svc as any).isExposable = () => true;
      (svc as any).emit = () => {};
      return svc;
    };
    // A model named like a nested titled type, before or after the model using it
    expect(() => build(["Shared", "Other"]).generateSchema()).toThrow(/GraphQL type Shared(Input)? is generated/);
    expect(() => build(["Other", "Shared"]).generateSchema()).toThrow(/GraphQL type Shared(Input)? is generated/);
    const ok = build(["Other", "Another"]);
    ok.generateSchema();
    expect(() => ok.generateSchema()).not.toThrow();
    expect(ok.namedTypes.get("Other").type).toBe(ok.modelsMap["Test/Other"]);
  });

  /**
   * @param properties - the properties of the Test/Account model
   * @returns the service with its schema generated
   */
  const accountService = (properties: any) => {
    const svc = service();
    const classes: any = {
      "Test/Account": { __meta: { Identifier: "Test/Account", Plural: "Test/Accounts", Actions: {}, Events: [] } }
    };
    const schemas: any = { "Test/Account": { type: "object", properties } };
    (svc as any).app = {
      getModels: () => classes,
      isFinalModel: () => true,
      getSchema: (i: string) => schemas[i]
    };
    (svc as any).parameters = { isIncluded: () => true, exposeMe: false };
    (svc as any).isExposable = () => true;
    (svc as any).emit = () => {};
    svc.generateSchema();
    return svc;
  };
  const simplefin = () => ({
    uuid: { type: "string" },
    "available-balance": { type: "string" },
    org: { type: "object", properties: { name: { type: "string" }, "sfin-url": { type: "string" } } }
  });

  it("renames the properties whose key is not a GraphQL name, and reads them under the new name", async () => {
    // JSON keys of an external API (SimpleFIN `available-balance`, `sfin-url`) are valid model properties, not
    // valid GraphQL names: new GraphQLSchema threw on them and the whole GraphQL service failed to start
    const svc = accountService(simplefin());
    expect(validateSchema((svc as any).schema)).toEqual([]);
    const account = svc.modelsMap["Test/Account"] as GraphQLObjectType;
    expect(Object.keys(account.getFields()).sort()).toEqual(["availableBalance", "org", "uuid"]);
    expect(Object.keys((account.getFields().org.type as GraphQLObjectType).getFields())).toEqual(["name", "sfinUrl"]);
    // A mutation with the GraphQL names stores the original keys, and the result reads them back
    createFromInput.mockImplementation(async (_model: any, input: any) => input);
    const res: any = await graphql({
      schema: (svc as any).schema,
      source: `mutation { createAccount(Account: { availableBalance: "12.5", org: { name: "Bank", sfinUrl: "https://b" } })
        { availableBalance org { name sfinUrl } } }`,
      contextValue: { getCurrentUserId: () => "user" }
    });
    expect(res.errors).toBeUndefined();
    expect(createFromInput.mock.calls[0][1]).toEqual({
      "available-balance": "12.5",
      org: { name: "Bank", "sfin-url": "https://b" }
    });
    expect(res.data.createAccount).toEqual({ availableBalance: "12.5", org: { name: "Bank", sfinUrl: "https://b" } });
  });

  it("keeps the real property when a renamed key collides with it, and the first of two renamed keys", () => {
    const svc = accountService({
      "available-balance": { type: "string" },
      availableBalance: { type: "number" },
      "a-b": { type: "string" },
      "a.b": { type: "boolean" }
    });
    expect(validateSchema((svc as any).schema)).toEqual([]);
    const fields = (svc.modelsMap["Test/Account"] as GraphQLObjectType).getFields();
    expect(Object.keys(fields).sort()).toEqual(["aB", "availableBalance"]);
    // The real availableBalance is the field (default resolver), available-balance is left out
    expect(fields.availableBalance.resolve).toBeUndefined();
    expect(fields.availableBalance.extensions.webdaKey).toBeUndefined();
    expect(fields.aB.resolve({ "a-b": "dash", "a.b": true }, {}, {}, {} as any)).toBe("dash");
  });

  it("restoreInputKeys writes only the declared fields, under the name the schema gives", () => {
    const input = new GraphQLInputObjectType({
      name: "RestoreInput",
      fields: {
        availableBalance: { type: GraphQLString, extensions: { webdaKey: "available-balance" } },
        org: { type: GraphQLString }
      }
    });
    // an unvalidated value: inherited names, __proto__ and undeclared keys never become properties
    const value = JSON.parse(
      '{"availableBalance":"1","org":"o","__proto__":{"polluted":true},"constructor":"x","extra":1}'
    );
    const restored = restoreInputKeys(input, value);
    expect(Object.keys(restored).sort()).toEqual(["available-balance", "org"]);
    expect(restored["available-balance"]).toBe("1");
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(restored)).toBe(Object.prototype);
  });
});
