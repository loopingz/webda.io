import { describe, it } from "vitest";
import * as assert from "assert";
import { MemoryRepository, OwnerModel, registerRepository, User } from "@webda/core";
import { graphql, GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";
import { GraphQLService } from "./graphql.service.js";

/**
 * Owner-only rows (complete permission query: partial false), linked to a parent
 */
class Entry extends OwnerModel {
  parent: string;
}
Entry.registerSerializer();

/**
 * @returns a service double with the resolver helpers
 */
function service(): GraphQLService {
  const svc: GraphQLService = Object.create(GraphQLService.prototype);
  (svc as any).log = () => {};
  (svc as any).countOperation = () => {};
  (svc as any).modelsMap = {};
  return svc;
}

/**
 * An executable schema with a root query and a relation query on Entry, resolved like the service does
 * @param svc - the service
 * @returns the schema
 */
function schema(svc: GraphQLService): GraphQLSchema {
  const entry = new GraphQLObjectType({ name: "Entry", fields: { uuid: { type: GraphQLString } } });
  const result = svc.getGraphQLQueryResult(entry);
  const related = {
    getQuery: (query: string) => (query ? `parent = 'p1' AND (${query})` : "parent = 'p1'")
  };
  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: "Query",
      fields: {
        Entries: {
          type: result,
          args: { query: { type: GraphQLString, defaultValue: "" } },
          resolve: (_, args, context) => svc.queryModel(Entry, args.query, context)
        },
        Related: {
          type: result,
          args: { query: { type: GraphQLString, defaultValue: "" } },
          resolve: (_, args, context) => svc.queryRelated(related, Entry, args.query, context)
        }
      }
    })
  });
}

describe("GraphQL query total", () => {
  it("is counted only when selected, with the caller permissions", async () => {
    registerRepository(User as any, new MemoryRepository(User as any, ["uuid"]) as any);
    registerRepository(Entry, new MemoryRepository(Entry, ["uuid"]) as any);
    await Entry.create({ uuid: "e1", parent: "p1", _user: "alice" } as any);
    await Entry.create({ uuid: "e2", parent: "p1", _user: "bob" } as any);
    await Entry.create({ uuid: "e3", parent: "p2", _user: "alice" } as any);
    await Entry.create({ uuid: "e4", parent: "p1", _user: "alice" } as any);
    const counts: any[] = [];
    const original = (Entry as any).count;
    (Entry as any).count = async (...args: any[]) => (counts.push(args), original.apply(Entry, args));
    try {
      const svc = service();
      const run = async (source: string) => {
        const res: any = await graphql({
          schema: schema(svc),
          source,
          contextValue: { getCurrentUserId: () => "alice" }
        });
        assert.deepStrictEqual(res.errors, undefined);
        // GraphQL objects have a null prototype
        return JSON.parse(JSON.stringify(res.data));
      };
      // Not selected: no count query
      let data = await run(`{ Entries { results { uuid } continuationToken } }`);
      assert.strictEqual(data.Entries.results.length, 3);
      assert.strictEqual(counts.length, 0);
      // Selected: the rows of bob are not counted
      data = await run(`{ Entries { results { uuid } total { value relation } } }`);
      assert.deepStrictEqual(data.Entries.total, { value: 3, relation: "eq" });
      assert.strictEqual(counts.length, 1);
      // A relation total only counts the related rows
      data = await run(`{ Related { results { uuid } total { value relation } } }`);
      assert.deepStrictEqual(data.Related.results.map((r: any) => r.uuid).sort(), ["e1", "e4"]);
      assert.deepStrictEqual(data.Related.total, { value: 2, relation: "eq" });
      data = await run(`{ Related(query: "uuid = 'e4'") { total { value } } }`);
      assert.deepStrictEqual(data.Related.total, { value: 1 });
    } finally {
      (Entry as any).count = original;
    }
  });

  it("is null when the model does not allow it", async () => {
    const svc = service();
    const result: any = svc.getGraphQLQueryResult(
      new GraphQLObjectType({ name: "Open", fields: { a: { type: GraphQLString } } })
    );
    // A partial permission query: rows are filtered with canAct, the store count would not match
    const model: any = {
      prototype: { canAct: () => true },
      getPermissionQuery: () => ({ query: "", partial: true }),
      query: async () => ({ results: [] }),
      count: async () => assert.fail("the store is not asked")
    };
    const page = await svc.queryModel(model, "", { getCurrentUserId: () => "u" });
    assert.strictEqual(await result.getFields().total.resolve(page, {}, {}, {}), null);
    // A plain object without the lazy count (subscription updates) has no total either
    assert.strictEqual(await result.getFields().total.resolve({ results: [] }, {}, {}, {}), null);
  });
});
