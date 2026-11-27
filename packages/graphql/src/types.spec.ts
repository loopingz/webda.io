import { describe, expect, it, vi } from "vitest";

// Models carry their metadata in `__meta` here, and the app has no service
const { storage } = vi.hoisted(() => ({
  storage: { operations: {} as Record<string, any> | undefined, services: {} as Record<string, any> }
}));

vi.mock("@webda/core", async importOriginal => ({
  ...(await importOriginal<any>()),
  useModelMetadata: (model: any) => model.__meta,
  getClientWritableAttributes: () => undefined,
  useCore: () => ({ getServices: () => storage.services }),
  useInstanceStorage: () => storage
}));

import {
  GraphQLBoolean,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  graphql,
  parseValue,
  validateSchema
} from "graphql";
import { GraphQLService } from "./graphql.service.js";
import { AnyScalarType } from "./types/any.js";
import { DateScalar } from "./types/date.js";
import { restoreInputKeys, toGraphQLName } from "./names.js";
import { GraphQLLong } from "./types/long.js";

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
    storage.operations = {
      "Account.Create": { method: "modelCreate", context: { model: classes["Test/Account"] } }
    };
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
    const callSpy = vi
      .spyOn(svc, "callModelOperation")
      .mockImplementation(async (_model: any, _method: any, _ctx: any, data: any) => ({ result: data }));
    const res: any = await graphql({
      schema: (svc as any).schema,
      source: `mutation { createAccount(Account: { availableBalance: "12.5", org: { name: "Bank", sfinUrl: "https://b" } })
        { availableBalance org { name sfinUrl } } }`,
      contextValue: { getCurrentUserId: () => "user" }
    });
    expect(res.errors).toBeUndefined();
    expect(callSpy.mock.calls[0][3]).toEqual({
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

    const listType = new GraphQLNonNull(new GraphQLList(input));
    expect(restoreInputKeys(listType, [{ availableBalance: "2" }])).toEqual([{ "available-balance": "2" }]);
    expect(restoreInputKeys(new GraphQLList(input), { availableBalance: "3" })).toEqual({
      "available-balance": "3"
    });
  });

  it("handles date-time, array $ref items, map objects, null properties, loadParameters, and handleModel", () => {
    const svc = service();
    expect(svc.loadParameters({}).url).toBe("/graphql");
    expect(svc.handleModel({} as any, "Test", {})).toBe(true);
    const arrayDef = svc.getJsonSchemaDefinition(
      { type: "array", items: { $ref: "#/definitions/Item" } },
      { Item: { type: "string" } }
    );
    expect(arrayDef.items).toEqual({ type: "string" });
    expect(svc.getGraphQLSchemaFromSchema({ type: "string", format: "date-time" }, "DT")?.type).toBe(DateScalar);
    expect(svc.getGraphQLSchemaFromSchema({ type: "object" }, "MapNoProps")?.type).toBe(AnyScalarType);
    expect(
      svc.getGraphQLSchemaFromSchema(
        { type: "object", properties: { __priv: { type: "string" }, nulled: { type: "null" } } },
        "MapEmptyProps"
      )?.type
    ).toBe(AnyScalarType);
    const fields = svc.getGraphQLFieldsFromSchema(
      { type: "object", properties: { ok: { type: "string" }, nulled: { type: "null" } } },
      "WithNullField"
    );
    expect(Object.keys(fields)).toEqual(["ok"]);
  });
});

describe("GraphQL converter fallbacks", () => {
  it("names any JSON key with a valid GraphQL name", () => {
    expect(toGraphQLName("available-balance")).toBe("availableBalance");
    expect(toGraphQLName("name")).toBe("name");
    // A leading digit is not allowed
    expect(toGraphQLName("2fa")).toBe("_2fa");
    expect(toGraphQLName("-3d-secure")).toBe("_3dSecure");
    // Nothing usable in the key
    expect(toGraphQLName("--")).toBe("_");
    expect(toGraphQLName("")).toBe("_");
  });

  it("truncates Long values toward zero", () => {
    expect(GraphQLLong.parseValue(12.9)).toBe(12);
    expect(GraphQLLong.parseValue(-12.9)).toBe(-12);
    expect(GraphQLLong.serialize("-7.5")).toBe(-7);
    expect(GraphQLLong.serialize(0)).toBe(0);
  });

  it("resolves a dangling $ref to the null type and maps unknown types to the Object scalar", () => {
    const svc = service();
    expect(svc.getJsonSchemaDefinition({ $ref: "#/definitions/Missing" }, {})).toEqual({ type: "null" });
    expect(svc.getJsonSchemaDefinition({ $ref: "#/definitions/Missing" })).toEqual({ type: "null" });
    expect(
      svc.getJsonSchemaDefinition(
        { $ref: "#/definitions/A" },
        { A: { $ref: "#/definitions/B" }, B: { type: "boolean" } }
      )
    ).toEqual({
      type: "boolean"
    });
    expect(svc.getGraphQLSchemaFromSchema({ type: "binary" } as any, "Unknown")?.type).toBe(AnyScalarType);
    // A schema without properties has no field
    expect(svc.getGraphQLFieldsFromSchema({ type: "object" }, "NoProperties")).toEqual({});
  });

  it("gives an operation without object input a single input argument", () => {
    const svc = service();
    const schemas: Record<string, any> = {
      text: { type: "string" },
      nothing: { type: "null" },
      named: { type: "object", properties: { name: { type: "string" } } }
    };
    (svc as any).app = { getSchema: (name: string) => schemas[name] };
    const text = svc.operationArgs({ input: "text" } as any, "Text");
    expect(text.args.input.type).toBe(GraphQLString);
    expect(text.toInput({ input: "hello" })).toBe("hello");
    // A schema the converter cannot map still takes a value
    const nothing = svc.operationArgs({ input: "nothing" } as any, "Nothing");
    expect(nothing.args.input.type).toBe(AnyScalarType);
    expect(nothing.toInput({ input: { any: "thing" } })).toEqual({ any: "thing" });
    // An argument GraphQL did not declare is passed as is
    const named = svc.operationArgs({ input: "named" } as any, "Named");
    expect(named.toInput({ name: "a", extra: { b: 1 } })).toEqual({ name: "a", extra: { b: 1 } });
    // No schema, or an unmappable one, for the output: the Object scalar
    expect(svc.operationOutputType({ output: "missing" } as any, "Missing")).toBe(AnyScalarType);
    expect(svc.operationOutputType({ output: "nothing" } as any, "Nothing")).toBe(AnyScalarType);
    expect(svc.operationOutputType({ output: "text" } as any, "Text")).toBe(GraphQLString);
  });

  it("reads the subscribed events from the selection set", () => {
    const svc = service();
    const field = (name: string) => ({ kind: "Field", name: { value: name } });
    expect(
      svc.getSubscribedEvents({
        fieldNodes: [{ selectionSet: { selections: [field("Created"), field("latestEventTime"), field("Deleted")] } }]
      } as any)
    ).toEqual(["Created", "Deleted"]);
    expect(svc.getSubscribedEvents({ fieldNodes: [{}] } as any)).toEqual([]);
  });

  it("accepts a missing query and reports any refusal as BAD_USER_INPUT", () => {
    const svc = service();
    expect(() => svc.assertFilterQuery(undefined as any)).not.toThrow();
    expect(() => svc.assertFilterQuery("a = 1")).not.toThrow();
    // Whatever is thrown while checking the statement becomes a GraphQL error
    (svc as any).assertNoStatement = () => {
      throw "not a filter";
    };
    let error: any;
    try {
      svc.assertFilterQuery("a = 1");
    } catch (err) {
      error = err;
    }
    expect(error?.message).toBe("not a filter");
    expect(error?.extensions).toEqual({ code: "BAD_USER_INPUT" });
  });

  it("places operations next to the model fields and names who owns a taken field", () => {
    const build = () => {
      const svc = service();
      (svc as any).app = { getSchema: (): any => undefined };
      (svc as any).parameters = {};
      (svc as any).operationPlacements = {};
      return svc;
    };
    const previous = storage.operations;
    try {
      // No operation registry at all
      storage.operations = undefined;
      const none = { query: {}, mutation: {}, subscription: {} };
      build().addOperationFields(none.query, none.mutation, none.subscription);
      expect(none).toEqual({ query: {}, mutation: {}, subscription: {} });

      storage.operations = {
        "Doc.Publish": { id: "Doc.Publish", method: "publish", graphql: { mutation: "publish" } },
        "Doc.Release": { id: "Doc.Release", method: "release", graphql: { mutation: "publish" } }
      };
      // Two operations asking for the same field
      expect(() => build().addOperationFields({}, {}, {})).toThrow(
        /GraphQL mutation field publish of operation Doc\.Release is already defined by operation Doc\.Publish/
      );
      // A field the model schema already has
      expect(() => build().addOperationFields({}, { publish: { type: GraphQLBoolean } }, {})).toThrow(
        /GraphQL mutation field publish of operation Doc\.Publish is already defined by the model schema/
      );
      delete storage.operations["Doc.Release"];
      const mutations: any = {};
      const svc = build();
      svc.addOperationFields({}, mutations, {});
      expect(Object.keys(mutations)).toEqual(["publish"]);
      expect(mutations.publish.type).toBe(GraphQLBoolean);
      expect((svc as any).operationPlacements["Doc.Publish"]).toEqual({ kind: "mutation", name: "publish" });
    } finally {
      storage.operations = previous;
    }
  });
});

describe("GraphQL schema generation without the optional parts", () => {
  it("leaves out models without metadata or not exposable, and subscriptions without events", async () => {
    const svc = service();
    const meta = (id: string): any => ({ Identifier: id, Plural: `${id}s`, Actions: {} });
    const classes: any = {
      "Test/Ghost": {},
      "Test/Internal": { __meta: { ...meta("Test/Internal"), Events: ["Rotated"] } },
      // No `Events` at all
      "Test/Doc": { __meta: meta("Test/Doc") },
      "Test/User": { __meta: meta("Test/User") }
    };
    (svc as any).app = {
      getModels: () => classes,
      getModel: (id: string) => classes[id],
      completeNamespace: (id: string) => id,
      isFinalModel: () => true,
      getSchema: () => ({ type: "object", properties: { uuid: { type: "string" } } })
    };
    (svc as any).parameters = { isIncluded: () => true, exposeMe: true, userModel: "Test/User" };
    (svc as any).isExposable = (_model: any, id: string) => id !== "Test/Internal";
    (svc as any).emit = () => {};
    // Services with nothing to publish
    storage.services = { Silent: { getClientEvents: (): any => undefined }, Plain: {} };
    try {
      svc.generateSchema();
    } finally {
      storage.services = {};
    }
    expect(
      Object.keys(svc.modelsMap)
        .filter(id => id.startsWith("Test/"))
        .sort()
    ).toEqual(["Test/Doc", "Test/User"]);
    const schema: GraphQLSchema = (svc as any).schema;
    expect(validateSchema(schema)).toEqual([]);
    const subscriptions = Object.keys(schema.getSubscriptionType()!.getFields());
    expect(subscriptions).toContain("Me");
    expect(subscriptions.filter(name => name.endsWith("Events"))).toEqual([]);

    // A single-object query without key looks for the empty key
    const queries = schema.getQueryType()!.getFields();
    const docQuery = Object.values(queries).find(f => f.type === svc.modelsMap["Test/Doc"])!;
    const loaded: any[] = [];
    (svc as any).loadModelInstance = async (uuid: string, model: any) => {
      loaded.push([uuid, model]);
      return null;
    };
    const context: any = { getExtension: (): any => undefined };
    expect(await docQuery.resolve!({}, {}, context, {} as any)).toBeNull();
    expect(loaded).toEqual([["", classes["Test/Doc"]]]);
  });

  it("counts operations only for a GraphQL request", () => {
    const svc = service();
    (svc as any).parameters = { maxOperationsPerRequest: 2 };
    // No graphql extension on the context: nothing to count
    expect(() => svc.countOperation({ getExtension: (): any => undefined } as any, 10)).not.toThrow();
    const ext = { count: 0 };
    const context: any = { getExtension: () => ext };
    svc.countOperation(context);
    svc.countOperation(context);
    expect(ext.count).toBe(2);
    expect(() => svc.countOperation(context)).toThrow(/Too many operations/);
  });

  it("resolves relations of an object whose relation attributes are not set", async () => {
    const svc = service();
    const type = (name: string) => new GraphQLObjectType({ name, fields: { uuid: { type: GraphQLString } } });
    svc.modelsMap = { "Test/Folder": type("Folder"), "Test/User": type("User"), "Test/Tag": type("Tag") };
    const classes: any = { "Test/Folder": { id: "Folder" }, "Test/User": { id: "User" }, "Test/Tag": { id: "Tag" } };
    (svc as any).app = { getModel: (id: string) => classes[id] };
    const single: any[] = [];
    const listed: any[] = [];
    (svc as any).loadModelInstance = async (uuid: string, model: any) => {
      single.push([uuid, model.id]);
      return null;
    };
    (svc as any).loadListedInstance = async (item: any, model: any) => {
      listed.push([item, model.id]);
      return item === "gone" ? null : { uuid: item.uuid ?? item };
    };
    const fields = svc.getGraphQLFieldsFromSchema({ type: "object", properties: { uuid: { type: "string" } } }, "Doc", {
      parent: { attribute: "folder", model: "Test/Folder" },
      links: [
        { attribute: "owner", model: "Test/User", type: "LINK" },
        { attribute: "tags", model: "Test/Tag", type: "LINKS_ARRAY" },
        { attribute: "members", model: "Test/User", type: "LINKS_MAP" }
      ],
      maps: [{ attribute: "watchers", model: "Test/User" }]
    } as any);
    expect(Object.keys(fields).sort()).toEqual(["folder", "members", "owner", "tags", "uuid", "watchers"]);
    const context: any = { getExtension: (): any => undefined };
    const info: any = { fieldNodes: [] };

    // Nothing set on the object
    await fields.folder.resolve({}, {}, context, info);
    await fields.owner.resolve({}, {}, context, info);
    expect(single).toEqual([
      ["", "Folder"],
      ["", "User"]
    ]);
    expect(await fields.tags.resolve({}, {}, context, info)).toEqual([]);
    expect(await fields.watchers.resolve({}, {}, context, info)).toEqual([]);
    expect(listed).toEqual([]);

    // Set relations: a map of links is read by its values, elements that cannot be loaded are dropped
    await fields.folder.resolve({ folder: "f1" }, {}, context, info);
    await fields.owner.resolve({ owner: "u1" }, {}, context, info);
    expect(single.slice(2)).toEqual([
      ["f1", "Folder"],
      ["u1", "User"]
    ]);
    expect(await fields.tags.resolve({ tags: ["t1", "gone"] }, {}, context, info)).toEqual([{ uuid: "t1" }]);
    expect(
      await fields.members.resolve({ members: { a: { uuid: "u1" }, b: { uuid: "u2" } } }, {}, context, info)
    ).toEqual([{ uuid: "u1" }, { uuid: "u2" }]);
    expect(await fields.watchers.resolve({ watchers: [{ uuid: "u3" }] }, {}, context, info)).toEqual([{ uuid: "u3" }]);
    expect(listed.map(([, model]) => model)).toEqual(["Tag", "Tag", "User", "User", "User"]);
  });
});
