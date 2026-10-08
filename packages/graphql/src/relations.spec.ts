import { describe, it } from "vitest";
import * as assert from "assert";
import { MemoryRepository, OwnerModel, registerRepository, User } from "@webda/core";
import { PrependCondition } from "@webda/ql";
import { GraphQLService } from "./graphql.service.js";

/**
 * Child readable only by its owner (OwnerModel), linked to a parent
 */
class Child extends OwnerModel {
  parent: string;
}
Child.registerSerializer();

describe("GraphQL relation sub-queries", () => {
  it("only return the children the caller can read", async () => {
    registerRepository(User as any, new MemoryRepository(User as any, ["uuid"]) as any);
    registerRepository(Child, new MemoryRepository(Child, ["uuid"]) as any);
    await Child.create({ uuid: "c-alice", parent: "p1", _user: "alice" } as any);
    await Child.create({ uuid: "c-bob", parent: "p1", _user: "bob" } as any);
    await Child.create({ uuid: "c-other", parent: "p2", _user: "alice" } as any);
    // What a ModelRelated exposes: the relation condition merged into the client query
    const related = {
      getQuery: (query: string) => (query ? `parent = 'p1' AND (${query})` : "parent = 'p1'"),
      // The legacy resolver called this directly: no permission filtering
      query: async (query: string) => Child.query(related.getQuery(query))
    };
    const service: GraphQLService = Object.create(GraphQLService.prototype);
    (service as any).log = () => {};
    (service as any).countOperation = () => {};
    const res = await service.queryRelated(related as any, Child, "", { getCurrentUserId: () => "alice" } as any);
    assert.deepStrictEqual(
      res.results.map((r: any) => r.uuid),
      ["c-alice"]
    );
    const filtered = await service.queryRelated(related as any, Child, "uuid = 'c-bob'", {
      getCurrentUserId: () => "alice"
    } as any);
    assert.deepStrictEqual(filtered.results, []);
  });

  it("a refused single-object read answers like a missing object", async () => {
    registerRepository(User as any, new MemoryRepository(User as any, ["uuid"]) as any);
    registerRepository(Child, new MemoryRepository(Child, ["uuid"]) as any);
    await Child.create({ uuid: "c-bob", parent: "p1", _user: "bob" } as any);
    await Child.create({ uuid: "c-public", parent: "p1", _user: "bob", public: true } as any);
    const service: GraphQLService = Object.create(GraphQLService.prototype);
    (service as any).log = () => {};
    (service as any).countOperation = () => {};
    const alice: any = { getCurrentUserId: () => "alice" };
    const error = async (fn: () => Promise<any>) => {
      try {
        await fn();
      } catch (err) {
        return { message: err.message, code: err.extensions?.code };
      }
      return undefined;
    };
    const refused = await error(() => service.loadModelInstance("c-bob", Child as any, alice));
    const missing = await error(() => service.loadModelInstance("c-nope", Child as any, alice));
    assert.deepStrictEqual(refused, { message: "Object not found", code: "NOT_FOUND" });
    assert.deepStrictEqual(refused, missing);
    // The single-object subscription too
    const subRefused = await error(() => service.registerAsyncIterator(Child as any, "c-bob", alice));
    const subMissing = await error(() => service.registerAsyncIterator(Child as any, "c-nope", alice));
    assert.deepStrictEqual(subRefused, { message: "Object not found", code: "NOT_FOUND" });
    assert.deepStrictEqual(subRefused, subMissing);
    assert.strictEqual(((await service.loadModelInstance("c-public", Child as any, alice)) as any).uuid, "c-public");
  });

  it("private fields cannot be queried, at any depth", async () => {
    registerRepository(User as any, new MemoryRepository(User as any, ["uuid"]) as any);
    registerRepository(Child, new MemoryRepository(Child, ["uuid"]) as any);
    await Child.create({
      uuid: "c-secret",
      parent: "p1",
      _user: "alice",
      __secret: "hunter2",
      inner: { __h: "x" }
    } as any);
    const related = { getQuery: (query: string) => PrependCondition(query, "parent = 'p1'") };
    const service: GraphQLService = Object.create(GraphQLService.prototype);
    const alice: any = { getCurrentUserId: () => "alice" };
    for (const q of ["__secret = 'hunter2'", "inner.__h LIKE 'x%'", "uuid = 'c' ORDER BY __secret"]) {
      await assert.rejects(() => service.queryRelated(related as any, Child, q, alice), /Private fields/, q);
    }
  });

  it("an object event subscription answers like a missing object when the object is unreadable", async () => {
    registerRepository(User as any, new MemoryRepository(User as any, ["uuid"]) as any);
    registerRepository(Child, new MemoryRepository(Child, ["uuid"]) as any);
    await Child.create({ uuid: "c-bob", parent: "p1", _user: "bob" } as any);
    const service: GraphQLService = Object.create(GraphQLService.prototype);
    const alice: any = { getCurrentUserId: () => "alice" };
    const error = async (fn: () => Promise<any>) => {
      try {
        await fn();
      } catch (err) {
        return { message: err.message, code: err.extensions?.code };
      }
      return undefined;
    };
    const refused = await error(() =>
      service.registerAsyncEventIterator(Child as any, "c-bob", ["test"], alice, "ChildEvents")
    );
    const missing = await error(() =>
      service.registerAsyncEventIterator(Child as any, "c-none", ["test"], alice, "ChildEvents")
    );
    assert.deepStrictEqual(refused, { message: "Object not found", code: "NOT_FOUND" });
    assert.deepStrictEqual(refused, missing);
  });
});
