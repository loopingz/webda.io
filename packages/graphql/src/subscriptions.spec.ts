import { describe, it } from "vitest";
import * as assert from "assert";
import { EventRepository, MemoryRepository, OwnerModel, registerRepository, User } from "@webda/core";
import { GraphQLService } from "./graphql.service.js";

/**
 * Model readable only by its owner (OwnerModel: permission query and canAct)
 */
class Secret extends OwnerModel {}
Secret.registerSerializer();

/**
 * @param userId - the subscriber
 * @returns a minimal caller context
 */
const contextOf = (userId: string) => ({ getCurrentUserId: () => userId });

/**
 * Read an iterator with a timeout, keeping a pending read for the next call
 * @param iterator - the subscription iterator
 * @returns a reader giving the next value, or "timeout" when none comes
 */
function reader(iterator: AsyncIterator<any>): () => Promise<any> {
  let pending: Promise<any> | undefined;
  return async () => {
    pending ??= iterator.next().then(r => r.value);
    const value = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve("timeout"), 200))]);
    if (value !== "timeout") {
      pending = undefined;
    }
    return value;
  };
}

describe("GraphQL query subscriptions", () => {
  it("only send objects the subscriber can read", async () => {
    // Owner links point at users
    registerRepository(User as any, new MemoryRepository(User as any, ["uuid"]) as any);
    registerRepository(Secret, new EventRepository(Secret, ["uuid"], new MemoryRepository(Secret, ["uuid"])) as any);
    await Secret.create({ uuid: "s-alice", _user: "alice" } as any);
    await Secret.create({ uuid: "s-bob", _user: "bob" } as any);
    const service: GraphQLService = Object.create(GraphQLService.prototype);
    (service as any).log = () => {};

    const iterator = await service.registerAsyncIteratorQuery(Secret as any, "Secrets", "", contextOf("alice"));
    // Initial results: alice only reads her object
    const next = reader(iterator);
    const initial = await next();
    assert.deepStrictEqual(
      initial.Secrets.results.map((r: any) => r.uuid),
      ["s-alice"]
    );

    // An object alice cannot read is created: she gets no event
    // (the read is started first: the iterator only listens once it is waiting for the next value)
    const afterBob = next();
    await new Promise(resolve => setImmediate(resolve));
    await Secret.create({ uuid: "s-bob-2", _user: "bob" } as any);
    assert.strictEqual(await afterBob, "timeout");

    // An object alice can read is created: the refreshed results still hide bob's objects
    await Secret.create({ uuid: "s-alice-2", _user: "alice" } as any);
    const update = await next();
    assert.notStrictEqual(update, "timeout");
    assert.deepStrictEqual(update.Secrets.results.map((r: any) => r.uuid).sort(), ["s-alice", "s-alice-2"]);
    await iterator.return?.(undefined);
  });
});
