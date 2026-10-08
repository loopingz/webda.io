import { describe, it } from "vitest";
import * as assert from "assert";
import {
  CoreModel as UuidModel,
  EventRepository,
  MemoryRepository,
  OwnerModel,
  registerRepository,
  User,
  WebdaError
} from "@webda/core";
import { GraphQLObjectType } from "graphql";
import { GraphQLService } from "./graphql.service.js";
import { createFromInput, updateFromInput } from "./mutations.js";

/**
 * Opted-in model: the static form only
 */
class OpenDoc extends UuidModel {
  static Metadata: any = { Identifier: "Test/OpenDoc", PrimaryKey: ["uuid"], Relations: {} };
  name: string;
  static canAct(): boolean {
    return true;
  }
}
OpenDoc.registerSerializer();

/**
 * Model defining neither canAct form
 */
class ClosedDoc extends UuidModel {
  static Metadata: any = { Identifier: "Test/ClosedDoc", PrimaryKey: ["uuid"], Relations: {} };
  name: string;
}
ClosedDoc.registerSerializer();

/**
 * Owner-only children, with private fields
 */
class Child extends OwnerModel {
  parent: string;
  __secret: string;
}
Child.registerSerializer();

/**
 * Model whose canAct throws a non-permission error on create, and on get once `boom` is set
 */
class Fragile extends UuidModel {
  static Metadata: any = { Identifier: "Test/Fragile", PrimaryKey: ["uuid"], Relations: {} };
  boom?: boolean;
  async canAct(_context: any, action: string): Promise<boolean | string> {
    if (action === "create") {
      throw new WebdaError.BadRequest("Secret too short");
    }
    if (this.boom) {
      throw new Error("db down");
    }
    return true;
  }
}
Fragile.registerSerializer();

/**
 * @returns a service double with the resolver helpers
 */
function service(): GraphQLService {
  const svc: GraphQLService = Object.create(GraphQLService.prototype);
  (svc as any).log = () => {};
  (svc as any).countOperation = () => {};
  (svc as any).privateWarned = new Set();
  return svc;
}

/**
 * @param fn - the call
 * @returns the GraphQL error code and message, or undefined when it succeeds
 */
async function error(fn: () => Promise<any>): Promise<{ message: string; code: string } | undefined> {
  try {
    await fn();
  } catch (err) {
    return { message: err.message, code: err.extensions?.code };
  }
  return undefined;
}

const alice: any = { getCurrentUserId: () => "alice" };

describe("GraphQL permissions go through the core helper", () => {
  it("a static-only opt-in works on every single-object path, a model without canAct is refused", async () => {
    registerRepository(OpenDoc, new MemoryRepository(OpenDoc, ["uuid"]) as any);
    registerRepository(ClosedDoc, new MemoryRepository(ClosedDoc, ["uuid"]) as any);
    await OpenDoc.create({ uuid: "o1", name: "open" } as any);
    await ClosedDoc.create({ uuid: "c1", name: "closed" } as any);
    const svc = service();
    assert.strictEqual(((await svc.loadModelInstance("o1", OpenDoc as any, alice)) as any).name, "open");
    const created: any = await createFromInput(OpenDoc, { name: "new" }, alice);
    assert.ok(created.uuid);
    const updated: any = await updateFromInput(OpenDoc, "o1", { name: "renamed" }, alice);
    assert.strictEqual(updated.name, "renamed");
    assert.ok(await svc.registerAsyncIterator(OpenDoc as any, "o1", alice, "OpenDoc"));
    // Deny by default: refused reads look missing, a refused create is a permission error
    const refused = await error(() => svc.loadModelInstance("c1", ClosedDoc as any, alice));
    const missing = await error(() => svc.loadModelInstance("nope", ClosedDoc as any, alice));
    assert.deepStrictEqual(refused, { message: "Object not found", code: "NOT_FOUND" });
    assert.deepStrictEqual(refused, missing);
    assert.deepStrictEqual(await error(() => createFromInput(ClosedDoc, { name: "x" }, alice)), {
      message: "Permission denied",
      code: "PERMISSION_DENIED"
    });
    assert.deepStrictEqual(await error(() => updateFromInput(ClosedDoc, "c1", { name: "x" }, alice)), {
      message: "Object not found",
      code: "NOT_FOUND"
    });
    assert.strictEqual((await ClosedDoc.ref("c1").get()).name, "closed");
  });

  it("any error thrown by canAct is a refusal, on create too", async () => {
    registerRepository(Fragile, new MemoryRepository(Fragile, ["uuid"]) as any);
    assert.deepStrictEqual(await error(() => createFromInput(Fragile, { uuid: "f1" }, alice)), {
      message: "Permission denied",
      code: "PERMISSION_DENIED"
    });
    assert.deepStrictEqual((await Fragile.query("")).results, []);
  });

  it("link and map filters cannot read private fields, unreadable elements are dropped", async () => {
    registerRepository(User as any, new MemoryRepository(User as any, ["uuid"]) as any);
    registerRepository(Child, new MemoryRepository(Child, ["uuid"]) as any);
    await Child.create({ uuid: "c-mine", parent: "p1", _user: "alice", __secret: "hunter2" } as any);
    await Child.create({ uuid: "c-bob", parent: "p1", _user: "bob", __secret: "hunter2" } as any);
    const svc = service();
    svc.modelsMap = { "Test/Child": new GraphQLObjectType({ name: "Child", fields: {} }) };
    (svc as any).app = { getModel: () => Child };
    const graph: any = {
      links: [
        { attribute: "children", model: "Test/Child", type: "LINKS_ARRAY" },
        { attribute: "favorite", model: "Test/Child", type: "LINK" }
      ],
      maps: [{ attribute: "mapped", model: "Test/Child", cascadeDelete: false }]
    };
    const fields = svc.getGraphQLFieldsFromSchema({ type: "object", properties: {} }, "Parent", graph);
    const info: any = { fieldNodes: [] };
    const source = { children: ["c-mine", "c-bob", "c-missing"], favorite: "c-bob", mapped: [{ uuid: "c-mine" }] };
    // Private fields in the filter: refused before anything is evaluated
    for (const filter of ["__secret = 'hunter2'", "__secret LIKE 'hunt%'", "uuid = 'c-mine' AND __secret = 'x'"]) {
      for (const attribute of ["children", "mapped"]) {
        const err = await error(() => fields[attribute].resolve(source, { filter }, alice, info));
        assert.strictEqual(err?.code, "BAD_USER_INPUT", `${attribute} ${filter}`);
      }
    }
    // A list keeps the readable elements and drops the unreadable or missing ones
    const children = await fields.children.resolve(source, {}, alice, info);
    assert.deepStrictEqual(
      children.map((c: any) => c.uuid),
      ["c-mine"]
    );
    const filtered = await fields.children.resolve(source, { filter: "uuid = 'c-bob'" }, alice, info);
    assert.deepStrictEqual(filtered, []);
    // A single link to an unreadable object still answers like a missing one
    assert.deepStrictEqual(await error(() => fields.favorite.resolve(source, {}, alice, info)), {
      message: "Object not found",
      code: "NOT_FOUND"
    });
  });

  it("output types leave private fields out", () => {
    const svc = service();
    const fields = svc.getGraphQLFieldsFromSchema(
      { type: "object", properties: { name: { type: "string" }, __secret: { type: "string" } } },
      "Thing"
    );
    assert.deepStrictEqual(Object.keys(fields), ["name"]);
  });

  it("a canAct throwing during a subscription update hides the object instead of failing", async () => {
    registerRepository(Fragile, new EventRepository(Fragile, ["uuid"], new MemoryRepository(Fragile, ["uuid"])) as any);
    const object = await Fragile.create({ uuid: "f-sub" } as any);
    const svc = service();
    const iterator = await svc.registerAsyncIterator(Fragile as any, "f-sub", alice, "Fragile");
    const first = await iterator.next();
    assert.strictEqual(first.value.Fragile.uuid, "f-sub");
    const pending = iterator.next();
    await new Promise(resolve => setImmediate(resolve));
    await object.patch({ boom: true } as any);
    const next = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve("timeout"), 500))]);
    assert.notStrictEqual(next, "timeout", "the update was delivered");
    assert.strictEqual((next as any).value.Fragile, null);
    await iterator.return?.(undefined);
  });
});
