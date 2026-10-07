import { describe, it } from "vitest";
import * as assert from "assert";
import { createFromInput, isInputAttribute, updateFromInput } from "./mutations.js";

/**
 * Minimal model double: a `password` behavior attribute, an in-memory store
 */
class FakeModel {
  static Metadata = { Relations: { behaviors: [{ attribute: "password", behavior: "Webda/Password" }] } };
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
  async canAct() {
    return FakeModel.allow;
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
    await assert.rejects(() => updateFromInput(FakeModel as any, "u2", {}, {} as any), /Permission denied/);
    FakeModel.allow = true;
  });

  it("input types omit behavior and private attributes", () => {
    const graph: any = { behaviors: [{ attribute: "password", behavior: "Webda/Password" }] };
    assert.strictEqual(isInputAttribute("name", graph), true);
    assert.strictEqual(isInputAttribute("password", graph), false);
    assert.strictEqual(isInputAttribute("__hash", graph), false);
    assert.strictEqual(isInputAttribute("name", undefined), true);
  });
});
