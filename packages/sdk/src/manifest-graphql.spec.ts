import {
  GraphQLID,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  type GraphQLFieldConfigMap
} from "graphql";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SdkManifestModel, SdkManifestOperation } from "./manifest.js";

const app = vi.hoisted(() => ({
  models: {} as Record<string, any>,
  schemas: {} as Record<string, any>,
  getModels() {
    return this.models;
  },
  getSchema(ref: string) {
    return this.schemas[ref];
  }
}));
vi.mock("@webda/core", () => ({ useApplication: () => app }));

const { describeGraphQL } = await import("./manifest-graphql.js");

/**
 * @param fields - the fields
 * @returns their config with an optional `webdaKey` extension
 */
const keyed = (fields: Record<string, [any, string?]>): GraphQLFieldConfigMap<any, any> =>
  Object.fromEntries(
    Object.entries(fields).map(([name, [type, key]]) => [
      name,
      { type, ...(key ? { extensions: { webdaKey: key } } : {}) }
    ])
  );

// Non-model object types
const Address = new GraphQLObjectType({ name: "Address", fields: keyed({ city: [GraphQLString] }) });
const Empty = new GraphQLObjectType({ name: "Empty", fields: {} });
const Node: GraphQLObjectType = new GraphQLObjectType({
  name: "Node",
  fields: () => keyed({ v: [GraphQLString], child: [Node] })
});
const Holder = new GraphQLObjectType({
  name: "Holder",
  fields: () => keyed({ tree: [Node], empty: [Empty], address: [Address, "home-address"], company: [Company] })
});
const UsersPage = new GraphQLObjectType({
  name: "UsersPage",
  fields: () => keyed({ results: [new GraphQLList(User)] })
});

// Model types
const Company: GraphQLObjectType = new GraphQLObjectType({
  name: "Company",
  fields: () => ({
    ...keyed({ uuid: [GraphQLID], name: [GraphQLString], available_balance: [GraphQLInt, "available-balance"] }),
    // A related query: arguments, read through its own query
    users: { type: UsersPage, args: { q: { type: GraphQLString } } },
    address: { type: Address }
  })
});
const User: GraphQLObjectType = new GraphQLObjectType({
  name: "User",
  fields: () =>
    keyed({
      uuid: [GraphQLID],
      company: [Company],
      company_ref: [Company, "company-ref"],
      friends: [new GraphQLList(Company)],
      byId: [new GraphQLList(Item)],
      contacts: [new GraphQLList(Tag)],
      ghost: [Ghost]
    })
});
const Item: GraphQLObjectType = new GraphQLObjectType({
  name: "Item",
  fields: () => keyed({ org: [GraphQLString], id: [GraphQLString], owner: [User], tag: [Tag] })
});
const Tag = new GraphQLObjectType({ name: "Tag", fields: keyed({ ref: [GraphQLString] }) });
const Ghost = new GraphQLObjectType({ name: "Ghost", fields: keyed({ uuid: [GraphQLID] }) });
const CompanyPage = new GraphQLObjectType({
  name: "CompanyPage",
  fields: keyed({ results: [new GraphQLList(Company)], continuationToken: [GraphQLString] })
});

const CompanyInput = new GraphQLInputObjectType({
  name: "CompanyInput",
  fields: {
    name: { type: GraphQLString },
    availableBalance: { type: GraphQLInt, extensions: { webdaKey: "available-balance" } }
  }
});
const DoInput = new GraphQLInputObjectType({ name: "DoInput", fields: { a: { type: GraphQLString } } });

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: "Query",
    fields: {
      Company: { type: Company, args: { uuid: { type: new GraphQLNonNull(GraphQLString) } } },
      Companies: { type: CompanyPage, args: { query: { type: GraphQLString } } },
      Item: { type: Item, args: { uuid: { type: GraphQLString } } },
      holder: { type: Holder },
      count: { type: GraphQLInt }
    }
  }),
  mutation: new GraphQLObjectType({
    name: "Mutation",
    fields: {
      createCompany: { type: Company, args: { Company: { type: CompanyInput } } },
      updateCompany: { type: Company, args: { uuid: { type: GraphQLString }, Company: { type: CompanyInput } } },
      createUser: { type: User, args: { data: { type: GraphQLString } } },
      svcDo: { type: GraphQLString, args: { input: { type: DoInput } } },
      svcRaw: { type: GraphQLString, args: { input: { type: GraphQLString } } },
      svcNamed: { type: GraphQLString, args: { input: { type: DoInput } } }
    }
  }),
  subscription: new GraphQLObjectType({
    name: "Subscription",
    fields: { ticks: { type: new GraphQLList(GraphQLInt), args: { n: { type: GraphQLInt } } } }
  })
});

/**
 * @param id - operation id
 * @param extra - other attributes
 * @returns a manifest operation
 */
const op = (id: string, extra: Partial<SdkManifestOperation> = {}): SdkManifestOperation => ({
  id,
  input: "void",
  output: "void",
  streaming: "none",
  ...extra
});

describe("describeGraphQL", () => {
  beforeEach(() => {
    app.models = {
      "Test/User": {
        Metadata: {
          PrimaryKey: [],
          Relations: {
            links: [
              { attribute: "company", type: "LINK" },
              { attribute: "friends", type: "LINKS_ARRAY" },
              { attribute: "byId", type: "LINKS_MAP" }
            ],
            maps: [{ attribute: "contacts" }]
          }
        }
      },
      "Test/Tag": { Metadata: { PrimaryKey: ["ref"], PrimaryKeySeparator: "-" } }
    };
    app.schemas = {
      "Svc.DoInput": { properties: { a: {} } },
      "Svc.NamedInput": { properties: { input: {} } }
    };
  });

  it("describes the CRUD and the operations from the schema", () => {
    const service = {
      schema,
      modelFields: {
        "Test/Company": {
          type: "Company",
          get: "Company",
          key: "uuid",
          query: "Companies",
          create: "createCompany",
          update: "updateCompany"
        },
        "Test/User": {
          type: "User",
          get: "User",
          key: "uuid",
          query: "Users",
          create: "createUser",
          delete: "deleteUser"
        },
        "Test/Item": { type: "Item", get: "Item", key: "uuid", query: "Items" },
        "Test/Tag": { type: "Tag", get: "Tag", key: "ref", query: "Tags" },
        "Test/Ghost": { type: "Ghost", get: "Ghost", key: "uuid", query: "Ghosts" }
      },
      operationPlacements: {
        "Svc.Do": { kind: "mutation", name: "svcDo" },
        "Svc.Raw": { kind: "mutation", name: "svcRaw" },
        "Svc.Named": { kind: "mutation", name: "svcNamed" },
        "Svc.Ticks": { kind: "subscription", name: "ticks" },
        "Svc.Holder": { kind: "query", name: "holder" },
        "Company.Count": { kind: "query", name: "count" },
        "Svc.Missing": { kind: "query", name: "missing" }
      }
    };
    const models = {
      "Test/Company": { primaryKey: ["uuid"] },
      "Test/Item": { primaryKey: ["org", "id"], primaryKeySeparator: "#" }
    } as unknown as Record<string, SdkManifestModel>;
    const company = { model: "Test/Company" };
    const operations: Record<string, SdkManifestOperation> = Object.fromEntries(
      [
        op("Company.Get", { ...company, kind: "get" }),
        op("Company.Query", { ...company, kind: "query" }),
        op("Company.Create", { ...company, kind: "create" }),
        op("Company.Update", { ...company, kind: "update" }),
        op("Company.Patch", { ...company, kind: "patch" }),
        // No delete mutation for the model
        op("Company.Delete", { ...company, kind: "delete" }),
        // An action of a model: placed like an operation
        op("Company.Count", { ...company, kind: "action" }),
        op("User.Create", { model: "Test/User", kind: "create" }),
        // In the model fields, not in the schema
        op("User.Delete", { model: "Test/User", kind: "delete" }),
        op("Item.Get", { model: "Test/Item", kind: "get" }),
        op("Svc.Do", { input: "Svc.DoInput?" }),
        op("Svc.Raw", { input: "Svc.RawInput" }),
        op("Svc.Named", { input: "Svc.NamedInput" }),
        op("Svc.Ticks", { streaming: "server" }),
        op("Svc.Holder"),
        op("Svc.Missing"),
        op("Svc.NotExposed")
      ].map(o => [o.id, o])
    );
    describeGraphQL(service, operations, models);

    const companySelection = {
      uuid: 1,
      name: 1,
      available_balance: { key: "available-balance" },
      address: { select: { city: 1 } }
    };
    expect(operations["Company.Get"].graphql).toEqual({
      kind: "query",
      name: "Company",
      args: { uuid: "String!" },
      selection: companySelection,
      keys: ["uuid"]
    });
    expect(operations["Company.Query"].graphql).toEqual({
      kind: "query",
      name: "Companies",
      args: { query: "String" },
      selection: { results: { select: companySelection }, continuationToken: 1 },
      keys: ["uuid"]
    });
    const wrap = { arg: "Company", fields: { name: "name", availableBalance: "available-balance" } };
    expect(operations["Company.Create"].graphql).toMatchObject({ kind: "mutation", name: "createCompany", wrap });
    expect(operations["Company.Update"].graphql).toMatchObject({ name: "updateCompany", wrap });
    expect(operations["Company.Patch"].graphql).toMatchObject({ name: "updateCompany", wrap });
    expect(operations["Company.Delete"].graphql).toBeUndefined();
    expect(operations["Company.Count"].graphql).toEqual({ kind: "query", name: "count" });
    expect(operations["User.Delete"].graphql).toBeUndefined();
    expect(operations["Svc.Missing"].graphql).toBeUndefined();
    expect(operations["Svc.NotExposed"].graphql).toBeUndefined();

    // Relations: linked as the REST API sends them, the target's key selected
    const user = operations["User.Create"].graphql!;
    expect(user.wrap).toBeUndefined();
    expect(user.keys).toEqual(["uuid"]);
    const companyLink = { model: "Test/Company", pk: ["uuid"] };
    expect(user.selection).toEqual({
      uuid: 1,
      company: { select: { uuid: 1 }, link: { ...companyLink, as: "id" } },
      company_ref: { key: "company-ref", select: { uuid: 1 }, link: { ...companyLink, as: "id" } },
      friends: { select: { uuid: 1 }, link: { ...companyLink, as: "ref" } },
      byId: { select: { org: 1, id: 1 }, link: { model: "Test/Item", pk: ["org", "id"], separator: "#", as: "map" } },
      contacts: { select: { ref: 1 }, link: { model: "Test/Tag", pk: ["ref"], separator: "-", as: "ref" } },
      ghost: { select: { uuid: 1 }, link: { model: "Test/Ghost", pk: ["uuid"], as: "id" } }
    });
    // A model without relations links by uid
    expect(operations["Item.Get"].graphql!.selection).toMatchObject({
      owner: { link: { model: "Test/User", pk: ["uuid"], as: "id" } },
      tag: { link: { model: "Test/Tag", as: "id" } }
    });
    expect(operations["Item.Get"].graphql!.keys).toEqual(["org", "id"]);

    // The `input` argument of an operation
    expect(operations["Svc.Do"].graphql!.wrap).toEqual({ arg: "input", fields: { a: "a" } });
    expect(operations["Svc.Raw"].graphql!.wrap).toEqual({ arg: "input" });
    // An input with an `input` attribute: the argument is that attribute
    expect(operations["Svc.Named"].graphql!.wrap).toBeUndefined();
    expect(operations["Svc.Ticks"].graphql).toEqual({ kind: "subscription", name: "ticks", args: { n: "Int" } });

    // Plain objects: nested up to a depth, empty ones left out, a model in a plain object is not a relation
    const holder = operations["Svc.Holder"].graphql!;
    expect(holder.keys).toBeUndefined();
    let tree: any = (holder.selection as any).tree;
    let depth = 0;
    while (tree.select.child) {
      tree = tree.select.child;
      depth++;
    }
    expect(depth).toBe(5);
    expect(tree.select).toEqual({ v: 1 });
    expect(holder.selection).toMatchObject({
      address: { key: "home-address", select: { city: 1 } },
      company: { select: { uuid: 1, name: 1 } }
    });
    expect((holder.selection as any).empty).toBeUndefined();
    expect((holder.selection as any).company.link).toBeUndefined();
    expect((holder.selection as any).company.select.users).toBeUndefined();
  });

  it("generates the schema of a service not initialized yet", () => {
    const service: any = {
      generateSchema() {
        this.schema = new GraphQLSchema({
          query: new GraphQLObjectType({ name: "Query", fields: { count: { type: GraphQLInt } } })
        });
        this.operationPlacements = { "Svc.Count": { kind: "query", name: "count" } };
      }
    };
    const operations = { "Svc.Count": op("Svc.Count") };
    describeGraphQL(service, operations, {});
    expect(service.app).toBe(app);
    expect(operations["Svc.Count"].graphql).toEqual({ kind: "query", name: "count" });

    // A service without model fields nor placements exposes nothing
    const bare = { "Svc.Count": op("Svc.Count") };
    describeGraphQL({ schema: service.schema }, bare, {});
    expect(bare["Svc.Count"].graphql).toBeUndefined();
    // A schema without root types
    const empty = { "Svc.Count": op("Svc.Count") };
    describeGraphQL({ schema: new GraphQLSchema({}), operationPlacements: service.operationPlacements }, empty, {});
    expect(empty["Svc.Count"].graphql).toBeUndefined();

    // No schema: nothing to describe
    const none = { "Svc.Count": op("Svc.Count") };
    describeGraphQL({ app: {}, generateSchema: () => {} }, none, {});
    expect(none["Svc.Count"].graphql).toBeUndefined();
  });
});
