import { describe, it } from "vitest";
import * as assert from "assert";
import { createFromInput, isInputAttribute, loadForAction, updateFromInput } from "./mutations.js";

/**
 * Minimal model double: a `password` behavior attribute, an in-memory store
 */
class FakeModel {
  static Metadata = {
    PrimaryKey: ["uuid"],
    Relations: { behaviors: [{ attribute: "password", behavior: "Webda/Password" }] }
  };
  static stored = new Map<string, FakeModel>();
  static allow = true;
  [key: string]: any;

  /**
   * @param uuid - primary key
   * @returns a reference
   */
  static ref(uuid: string) {
    return { get: async () => FakeModel.stored.get(uuid) };
  }

  /**
   * @param data - data to merge
   * @returns this
   */
  load(data: any) {
    Object.assign(this, data);
    return this;
  }

  /**
   * @returns the permission answer
   */
  async canAct(_context: any, action: string) {
    if ((FakeModel.allow as any) === "get-only") {
      return action === "get";
    }
    return FakeModel.allow;
  }

  /**
   * @returns a repository whose create refuses existing keys, like the real ones
   */
  getRepository() {
    return {
      create: async (object: FakeModel) => {
        if (FakeModel.stored.has(object.uuid)) {
          throw new Error(`Already exists: ${object.uuid}`);
        }
        FakeModel.stored.set(object.uuid, object);
        return object;
      }
    };
  }

  /**
   * @returns this
   */
  async save() {
    FakeModel.stored.set(this.uuid, this);
    return this;
  }
}

describe("GraphQL mutations", () => {
  it("create strips behavior and private fields", async () => {
    FakeModel.allow = true;
    const created: any = await createFromInput(
      FakeModel as any,
      { uuid: "c1", name: "N", password: { __hash: "x" }, __secret: 1, nested: { __hash: "y", ok: 1 } },
      {} as any
    );
    assert.strictEqual(created.name, "N");
    assert.strictEqual(created.password, undefined);
    assert.strictEqual(created.__secret, undefined);
    assert.deepStrictEqual(created.nested, { ok: 1 });
  });

  it("update keeps the stored behavior state", async () => {
    FakeModel.allow = true;
    const stored = new FakeModel().load({ uuid: "u1", name: "Old", password: { __hash: "orig", changedAt: 1 } });
    FakeModel.stored.set("u1", stored);
    const updated: any = await updateFromInput(
      FakeModel as any,
      "u1",
      { name: "New", password: { __hash: "evil", changedAt: 2 }, __foo: "x" },
      {} as any
    );
    assert.strictEqual(updated.name, "New");
    assert.deepStrictEqual(updated.password, { __hash: "orig", changedAt: 1 });
    assert.strictEqual(updated.__foo, undefined);
  });

  it("refuses without permission", async () => {
    FakeModel.allow = false;
    await assert.rejects(() => createFromInput(FakeModel as any, { uuid: "c2" }, {} as any), /Permission denied/);
    FakeModel.stored.set("u2", new FakeModel().load({ uuid: "u2" }));
    // Not readable: answers like a missing object
    await assert.rejects(() => updateFromInput(FakeModel as any, "u2", {}, {} as any), /Object not found/);
    FakeModel.allow = true;
  });

  it("input types omit behavior and private attributes", () => {
    const graph: any = { behaviors: [{ attribute: "password", behavior: "Webda/Password" }] };
    assert.strictEqual(isInputAttribute("name", graph), true);
    assert.strictEqual(isInputAttribute("password", graph), false);
    assert.strictEqual(isInputAttribute("__hash", graph), false);
    assert.strictEqual(isInputAttribute("name", undefined), true);
  });

  it("create over an existing key is a conflict, the stored object is unchanged", async () => {
    FakeModel.allow = true;
    const original = new FakeModel().load({ uuid: "dup", name: "Original" });
    FakeModel.stored.set("dup", original);
    await assert.rejects(
      () => createFromInput(FakeModel as any, { uuid: "dup", name: "pwned" }, {} as any),
      (err: any) => err.extensions?.code === "CONFLICT"
    );
    assert.strictEqual(FakeModel.stored.get("dup"), original);
    assert.strictEqual(original.name, "Original");
  });

  it("update cannot swap the primary key", async () => {
    FakeModel.allow = true;
    const victim = new FakeModel().load({ uuid: "victim", name: "V" });
    const mine = new FakeModel().load({ uuid: "mine", name: "M" });
    FakeModel.stored.set("victim", victim);
    FakeModel.stored.set("mine", mine);
    await assert.rejects(
      () => updateFromInput(FakeModel as any, "mine", { uuid: "victim", name: "pwned" }, {} as any),
      (err: any) => err.extensions?.code === "BAD_USER_INPUT"
    );
    assert.strictEqual(FakeModel.stored.get("victim").name, "V");
    assert.strictEqual(FakeModel.stored.get("mine").name, "M");
    const ok: any = await updateFromInput(FakeModel as any, "mine", { uuid: "mine", name: "M2" }, {} as any);
    assert.strictEqual(ok.uuid, "mine");
    assert.strictEqual(ok.name, "M2");
  });

  it("underscore attributes are never taken from the input", async () => {
    FakeModel.allow = true;
    const created: any = await createFromInput(
      FakeModel as any,
      { uuid: "r1", _roles: ["admin"], _groups: ["admins"], _user: "other" },
      {} as any
    );
    assert.strictEqual(created._roles, undefined);
    assert.strictEqual(created._groups, undefined);
    assert.strictEqual(created._user, undefined);
    const updated: any = await updateFromInput(FakeModel as any, "r1", { _roles: ["admin"] }, {} as any);
    assert.strictEqual(updated._roles, undefined);
    assert.strictEqual(isInputAttribute("_roles", undefined), false);
    assert.strictEqual(isInputAttribute("_color", undefined, ["_color"]), true);
  });

  it("a refused update or delete answers like a missing object unless the object is readable", async () => {
    FakeModel.stored.set("hidden", new FakeModel().load({ uuid: "hidden", name: "H" }));
    const error = async (fn: () => Promise<any>) => {
      try {
        await fn();
      } catch (err) {
        return { message: err.message, code: err.extensions?.code };
      }
      return undefined;
    };
    FakeModel.allow = false;
    const refused = await error(() => updateFromInput(FakeModel as any, "hidden", { name: "x" }, {} as any));
    const missing = await error(() => updateFromInput(FakeModel as any, "nope", { name: "x" }, {} as any));
    assert.deepStrictEqual(refused, { message: "Object not found", code: "NOT_FOUND" });
    assert.deepStrictEqual(refused, missing);
    assert.deepStrictEqual(await error(() => loadForAction(FakeModel, "hidden", {}, "delete")), refused);
    // Readable but refused: permission denied
    FakeModel.allow = "get-only" as any;
    assert.deepStrictEqual(await error(() => updateFromInput(FakeModel as any, "hidden", { name: "x" }, {} as any)), {
      message: "Permission denied",
      code: "PERMISSION_DENIED"
    });
    FakeModel.allow = true;
    assert.strictEqual(FakeModel.stored.get("hidden").name, "H");
  });
});
