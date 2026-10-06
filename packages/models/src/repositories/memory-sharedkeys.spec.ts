import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Model, UuidModel } from "../model.model.js";
import { MemoryRepository } from "./memory";

/** Single key model */
class Single extends UuidModel {
  name: string;
}
Single.registerSerializer();

/** Composite key model ("a:b") */
class Composite extends Model {
  a: string;
  b: string;
  constructor(data?: Partial<Composite>) {
    super();
    Object.assign(this, data);
  }
}
Composite.registerSerializer();

(Single as any).Metadata = { Identifier: "Test/Single", Subclasses: [] };
(Composite as any).Metadata = { Identifier: "Test/Composite", Subclasses: [] };

@suite
class MemoryRepositorySharedKeysTest {
  setup() {
    const shared = new Map<string, string>();
    const single = new MemoryRepository(Single, ["uuid"], ":", shared);
    const composite = new MemoryRepository(Composite, ["a", "b"], ":", shared);
    return { shared, single, composite };
  }

  @test
  async differentKeyShapesShareStorage() {
    const { single, composite } = this.setup();
    await single.create(new Single({ uuid: "u1", name: "n" } as any));
    await composite.create(new Composite({ a: "x", b: "y" }));
    assert.deepStrictEqual(
      (await single.query("")).results.map((r: any) => r.uuid),
      ["u1"]
    );
    assert.deepStrictEqual(
      (await composite.query("")).results.map((r: any) => `${r.a}:${r.b}`),
      ["x:y"]
    );
  }

  @test
  async corruptedOwnRecordRejects() {
    const { shared, single, composite } = this.setup();
    await composite.create(new Composite({ a: "x", b: "y" }));
    // Unparseable payload: the type cannot be read, it must not be dropped silently
    shared.set("broken", "{not json");
    await assert.rejects(() => single.query(""));
    shared.delete("broken");
    // Envelope of the queried model whose key is invalid for it: the error must propagate
    shared.set("bad", JSON.stringify({ ...JSON.parse(shared.get("x:y")!), __type: "Test/Composite" }));
    await assert.rejects(() => composite.query(""));
  }
}
