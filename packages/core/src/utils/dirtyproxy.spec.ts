import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { getDirtyProxy } from "./dirtyproxy";

@suite
class DirtyProxyTest {
  proxy = getDirtyProxy(<any>new Object());

  @test
  stringAttribute() {
    assert.strictEqual(this.proxy.isDirty, false);
    // Test basic attribute
    this.proxy.test = "test";
    assert.strictEqual(this.proxy.isDirty, true);
    // Ensure `dirtyProperties` is read-only
    this.proxy.dirtyProperties = [];
    assert.deepStrictEqual(this.proxy.dirtyProperties, ["test"]);
    // Ensure we can reset dirty
    this.proxy.isDirty = false;
    assert.strictEqual(this.proxy.isDirty, false);
    // Test delete attribute
    delete this.proxy.test;
    assert.strictEqual(this.proxy.isDirty, true);
    this.proxy.isDirty = false;
  }

  @test
  validator() {
    const proxy: any = getDirtyProxy(new Object({ forbidden: "TEST" }), (mode, property, value) => {
      if (property === "card" && mode === "set") {
        return value.replace(/\d/g, "X");
      } else if (property === "forbidden") {
        throw new Error(`Cannot ${mode} '${property}' property`);
      }
      return value;
    });
    proxy.card = "1234-1234";
    assert.strictEqual(proxy.card, "XXXX-XXXX");
    assert.throws(() => proxy.forbidden, /Cannot get 'forbidden' property/);
    assert.throws(() => {
      proxy.forbidden = "TEST2";
    }, /Cannot set 'forbidden' property/);
    assert.throws(() => delete proxy.forbidden, /Cannot delete 'forbidden' property/);
  }

  @test
  integerAttribute() {
    this.proxy.number = 0;
    assert.strictEqual(this.proxy.isDirty, true);
    this.proxy.isDirty = false;
    this.proxy.number++;
    assert.strictEqual(this.proxy.isDirty, true);
    this.proxy.isDirty = false;
  }

  @test
  arrayAttribute() {
    // Test array attribute
    this.proxy.array = ["item1", "item2"];
    assert.strictEqual(this.proxy.isDirty, true);
    this.proxy.isDirty = false;
    this.proxy.array.push({ name: "item3" });
    assert.strictEqual(this.proxy.isDirty, true);
    this.proxy.isDirty = false;
    this.proxy.array[2].other = "test";
    assert.strictEqual(this.proxy.isDirty, true);
    this.proxy.isDirty = false;
    this.proxy.array.pop();
    assert.strictEqual(this.proxy.isDirty, true);
    this.proxy.isDirty = false;
  }

  @test
  objectAttribute() {
    // Test object attribute
    this.proxy.obj = {};
    assert.strictEqual(this.proxy.isDirty, true);
    this.proxy.isDirty = false;
    this.proxy.obj.subobject = {};
    assert.strictEqual(this.proxy.isDirty, true);
    this.proxy.isDirty = false;
  }
}
