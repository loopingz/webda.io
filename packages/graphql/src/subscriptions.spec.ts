import { describe, it, vi } from "vitest";
import * as assert from "assert";
import {
  EventRepository,
  MemoryRepository,
  OwnerModel,
  registerRepository,
  runWithInstanceStorage,
  User
} from "@webda/core";
import { CloseCode } from "graphql-ws";
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

  it("model events never carry server-only fields, class-wide or per object", async () => {
    registerRepository(User as any, new MemoryRepository(User as any, ["uuid"]) as any);
    const repo = new EventRepository(Secret, ["uuid"], new MemoryRepository(Secret, ["uuid"]));
    registerRepository(Secret, repo as any);
    await Secret.create({ uuid: "s-alice", _user: "alice" } as any);
    const service: GraphQLService = Object.create(GraphQLService.prototype);
    (service as any).log = () => {};
    await runWithInstanceStorage({ core: { getModelStore: () => undefined } } as any, async () => {
      const object: any = await Secret.create({ uuid: "s-alice-2", _user: "alice" } as any);
      object.name = "visible";
      object.__secret = "hunter2";
      for (const uuid of [null, "s-alice"]) {
        const iterator = await service.registerAsyncEventIterator(
          Secret as any,
          uuid,
          ["Updated"],
          contextOf("alice"),
          "SecretEvents"
        );
        const next = reader(iterator);
        // The first value is the initial one
        await next();
        const pending = next();
        await new Promise(resolve => setImmediate(resolve));
        await (repo as any).emit("Updated", { object_id: "s-alice", object });
        const evt = await pending;
        assert.notStrictEqual(evt, "timeout", String(uuid));
        const sent = evt.SecretEvents.Updated;
        assert.strictEqual(sent.object.name, "visible");
        assert.ok(!JSON.stringify(evt).includes("__secret"), JSON.stringify(evt));
        assert.ok(!JSON.stringify(evt).includes("hunter2"), JSON.stringify(evt));
        await iterator.return?.(undefined);
      }
    });
  });
});

describe("GraphQL websocket messages", () => {
  it("a failing message handler is logged and closes the socket without details", async () => {
    const service: GraphQLService = Object.create(GraphQLService.prototype);
    const log = vi.fn();
    (service as any).log = log;
    const socket = { close: vi.fn() };
    const failure = new Error("database password is hunter2");
    const storage: any = { core: {} };
    await service.handleSocketMessage(
      socket,
      async () => {
        throw failure;
      },
      "{}",
      storage
    );
    assert.deepStrictEqual(socket.close.mock.calls, [[CloseCode.InternalServerError, "Internal server error"]]);
    assert.deepStrictEqual(log.mock.calls, [["ERROR", "GraphQL websocket message failed", failure]]);
  });
});
