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

/** Composite key model accepting legacy `"<a>_<b>"` keys */
class LegacyComposite extends Composite {
  /** Legacy body field */
  uuid?: string;
  /**
   * @param uid - raw key
   * @returns the parsed key, or undefined
   */
  static parseLegacyUID(uid: string): { a: string; b: string } | undefined {
    const i = uid.lastIndexOf("_");
    return i > 0 ? { a: uid.substring(0, i), b: uid.substring(i + 1) } : undefined;
  }
}
LegacyComposite.registerSerializer();

/** Child of Single */
class SingleChild extends Single {}
SingleChild.registerSerializer();
/** Grandchild of Single (reached only transitively) */
class SingleGrandChild extends SingleChild {}
SingleGrandChild.registerSerializer();

(SingleGrandChild as any).Metadata = { Identifier: "Test/SingleGrandChild", Subclasses: [] };
(SingleChild as any).Metadata = { Identifier: "Test/SingleChild", Subclasses: [SingleGrandChild] };
(Single as any).Metadata = { Identifier: "Test/Single", Subclasses: [SingleChild] };
(Composite as any).Metadata = { Identifier: "Test/Composite", Subclasses: [] };
(LegacyComposite as any).Metadata = { Identifier: "Test/LegacyComposite", Subclasses: [] };

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

  @test
  async plainRowsHydrateAsModel() {
    const { shared, single } = this.setup();
    // A row written without the serializer envelope (earlier layout)
    shared.set("p1", JSON.stringify({ uuid: "p1", __type: "Test/Single", name: "plain" }));
    const item: any = await single.get("p1");
    assert.ok(item instanceof Single);
    assert.strictEqual(item.name, "plain");
    assert.strictEqual(item.__type, "Test/Single");
    assert.strictEqual(Object.keys(item).includes("__type"), false);
    assert.deepStrictEqual(
      (await single.query("name = 'plain'")).results.map((r: any) => r.uuid),
      ["p1"]
    );
  }

  @test
  async legacyUidHook() {
    const shared = new Map<string, string>();
    const repo = new MemoryRepository(LegacyComposite, ["a", "b"], ":", shared);
    const plain = new MemoryRepository(Composite, ["a", "b"], ":", shared);
    await repo.create(new LegacyComposite({ a: "x", b: "y" }));
    shared.set("a_b@x_c", JSON.stringify({ uuid: "a_b@x_c", __type: "Test/LegacyComposite" }));
    // The hook keeps the raw key as the string form of the parsed key
    const key: any = repo.parseUID("a_b@x_c");
    assert.deepStrictEqual({ ...key }, { a: "a_b@x", b: "c" });
    assert.strictEqual(`${key}`, "a_b@x_c");
    assert.strictEqual(repo.getPrimaryKey(key).toString(), "a_b@x_c");
    assert.strictEqual(repo.getPrimaryKey("a_b@x_c").toString(), "a_b@x_c");
    assert.ok(await repo.exists("a_b@x_c"));
    assert.strictEqual(((await repo.get("a_b@x_c")) as any).uuid, "a_b@x_c");
    // Queries see both layouts and do not throw
    assert.strictEqual((await repo.query("")).results.length, 2);
    // A model without the hook still rejects the key
    assert.throws(() => plain.parseUID("a_b@x_c"), /Invalid UID/);
    // Unrecognised keys still surface
    shared.set("nounderscore", JSON.stringify({ __type: "Test/LegacyComposite" }));
    await assert.rejects(() => repo.query(""), /Invalid UID/);
    shared.delete("nounderscore");
    await repo.delete(repo.parseUID("a_b@x_c") as any);
    assert.strictEqual(shared.has("a_b@x_c"), false);
    assert.ok(shared.has("x:y"));
  }

  @test
  async plainRowsTypeChecked() {
    const { shared, single } = this.setup();
    // Transitive subclass resolved from __type
    shared.set("g1", JSON.stringify({ uuid: "g1", __type: "Test/SingleGrandChild", name: "g" }));
    assert.ok((await single.get("g1")) instanceof SingleGrandChild);
    // An unrelated type is refused, not re-typed as the repository model
    shared.set("f1", JSON.stringify({ uuid: "f1", __type: "Test/Composite", a: "x" }));
    await assert.rejects(() => single.get("f1"), /Test\/Composite/);
    // An ancestor-typed row read through a subclass repository hydrates as the subclass
    const child = new MemoryRepository(SingleGrandChild, ["uuid"], ":", shared);
    shared.set("a1", JSON.stringify({ uuid: "a1", __type: "Test/Single", name: "a" }));
    const ancestor: any = await child.get("a1");
    assert.ok(ancestor instanceof SingleGrandChild);
    assert.strictEqual(ancestor.name, "a");
    await assert.rejects(() => child.get("f1"), /Test\/Composite/);
    // A row without type is the repository model
    shared.set("n1", JSON.stringify({ uuid: "n1", name: "n" }));
    assert.ok((await single.get("n1")) instanceof Single);
  }
}
