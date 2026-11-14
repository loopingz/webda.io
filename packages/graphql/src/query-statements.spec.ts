import { describe, it } from "vitest";
import * as assert from "assert";
import { EventRepository, MemoryRepository, OwnerModel, registerRepository, User } from "@webda/core";
import { GraphQLObjectType } from "graphql";
import { GraphQLService } from "./graphql.service.js";

/**
 * Model readable by its owner
 */
class Note extends OwnerModel {
  parent?: string;
}
Note.registerSerializer();

const STATEMENTS = [
  "DELETE",
  "DELETE WHERE uuid = 'n-bob'",
  "UPDATE SET public = TRUE",
  "UPDATE SET public = TRUE WHERE uuid = 'n-bob'",
  "SELECT uuid",
  "SELECT uuid, _user WHERE uuid = 'n-alice'",
  "HYDRATE _user",
  "uuid = 'n-alice' HYDRATE _user INNER LIMIT 1"
];

/**
 * @param fn - the call
 * @returns the GraphQL error code, undefined when the call succeeds
 */
async function codeOf(fn: () => Promise<any>): Promise<string | undefined> {
  try {
    await fn();
  } catch (err) {
    return err.extensions?.code ?? `not a GraphQL error: ${err.message}`;
  }
  return undefined;
}

/**
 * @returns a service built without an application, as the other GraphQL specs do
 */
function service(): GraphQLService {
  const svc: GraphQLService = Object.create(GraphQLService.prototype);
  (svc as any).log = () => {};
  (svc as any).countOperation = () => {};
  return svc;
}

describe("GraphQL query arguments take a filter only", () => {
  const alice: any = { getCurrentUserId: () => "alice" };

  /**
   * Fresh repositories with one object per owner
   */
  async function seed() {
    registerRepository(User as any, new MemoryRepository(User as any, ["uuid"]) as any);
    registerRepository(Note, new EventRepository(Note, ["uuid"], new MemoryRepository(Note, ["uuid"])) as any);
    await Note.create({ uuid: "n-alice", _user: "alice", parent: "p1" } as any);
    await Note.create({ uuid: "n-bob", _user: "bob", parent: "p1" } as any);
  }

  it("root queries, subscriptions and related queries refuse statements with BAD_USER_INPUT", async () => {
    await seed();
    const svc = service();
    const related = { getQuery: (q: string) => q };
    for (const query of STATEMENTS) {
      assert.strictEqual(await codeOf(() => svc.queryModel(Note, query, alice)), "BAD_USER_INPUT", query);
      assert.strictEqual(
        await codeOf(() => svc.registerAsyncIteratorQuery(Note as any, "Notes", query, alice)),
        "BAD_USER_INPUT",
        query
      );
      assert.strictEqual(
        await codeOf(() => svc.queryRelated(related as any, Note, query, alice)),
        "BAD_USER_INPUT",
        query
      );
    }
    // A field list is refused here, unlike the REST, gRPC and MCP Query operations: the selection set chooses
    await assert.rejects(
      () => svc.queryModel(Note, "SELECT uuid", alice),
      /SELECT field lists are not accepted by queries: use the selection set/
    );
    await assert.rejects(() => svc.queryModel(Note, "DELETE", alice), /DELETE statements are not accepted by queries/);
    // HYDRATE too, unlike REST and MCP: the relation fields of the schema load the related objects
    await assert.rejects(
      () => svc.queryModel(Note, "HYDRATE _user", alice),
      /HYDRATE is not accepted: select the relation fields/
    );
    // Lowercase words are fields
    assert.deepStrictEqual((await svc.queryModel(Note, "hydrate = 1 OR uuid = 'n-alice'", alice)).results.length, 1);
    // Nothing was deleted or changed
    assert.deepStrictEqual((await Note.query("")).results.map((n: any) => [n.uuid, !!n.public]).sort(), [
      ["n-alice", false],
      ["n-bob", false]
    ]);
    // Filters keep working
    const res = await svc.queryModel(Note, "uuid = 'n-alice' OR uuid = 'n-bob'", alice);
    assert.deepStrictEqual(
      res.results.map((n: any) => n.uuid),
      ["n-alice"]
    );
  });

  it("link and map filters refuse statements with BAD_USER_INPUT", async () => {
    await seed();
    const svc = service();
    svc.modelsMap = { "Test/Note": new GraphQLObjectType({ name: "Note", fields: {} }) };
    (svc as any).app = { getModel: () => Note };
    const graph: any = {
      links: [{ attribute: "notes", model: "Test/Note", type: "LINKS_ARRAY" }],
      maps: [{ attribute: "mapped", model: "Test/Note", cascadeDelete: false }]
    };
    const fields = svc.getGraphQLFieldsFromSchema({ type: "object", properties: {} }, "Parent", graph);
    const source = { notes: ["n-alice", "n-bob"], mapped: [{ uuid: "n-alice" }] };
    for (const filter of STATEMENTS) {
      for (const attribute of ["notes", "mapped"]) {
        assert.strictEqual(
          await codeOf(() => fields[attribute].resolve(source, { filter }, alice, { fieldNodes: [] } as any)),
          "BAD_USER_INPUT",
          `${attribute} ${filter}`
        );
      }
    }
    assert.throws(() => svc.parseFilter("SELECT uuid"), /use the selection set/);
    assert.throws(() => svc.parseFilter("HYDRATE notes"), /HYDRATE is not accepted: select the relation fields/);
    const kept = await fields.notes.resolve(source, { filter: "uuid = 'n-alice'" }, alice, { fieldNodes: [] } as any);
    assert.deepStrictEqual(
      kept.map((n: any) => n.uuid),
      ["n-alice"]
    );
  });
});
