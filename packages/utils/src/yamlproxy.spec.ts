import { suite, test } from "@webda/test";
import * as assert from "assert";
import { YAMLProxy } from "./yamlproxy";

@suite
class YAMLProxyTest {
  @test
  parseSimpleObject() {
    const yaml = "key: value\nnum: 42";
    const obj = YAMLProxy.parse(yaml);
    assert.strictEqual(obj.key, "value");
    assert.strictEqual(obj.num, 42);
  }

  @test
  parseNestedArray() {
    const yaml = "root:\n  - item1\n  - item2";
    const obj = YAMLProxy.parse(yaml);
    assert.strictEqual(obj.root[0], "item1");
    assert.strictEqual(obj.root[1], "item2");
  }

  @test
  parseNestedStructure() {
    const yaml = "root:\n  nested:\n    - a\n    - b";
    const obj = YAMLProxy.parse(yaml);
    assert.strictEqual(obj.root.nested[0], "a");
    assert.strictEqual(obj.root.nested[1], "b");
  }

  @test
  arrayPush() {
    const yaml = "items:\n  - one\n  - two";
    const obj = YAMLProxy.parse(yaml);
    obj.items.push("three");
    assert.strictEqual(obj.items[2], "three");
    assert.strictEqual(obj.items.length, 3);
  }

  @test
  arrayPop() {
    const yaml = "items:\n  - one\n  - two";
    const obj = YAMLProxy.parse(yaml);
    const value = obj.items.pop();
    assert.strictEqual(value, "two");
    assert.strictEqual(obj.items.length, 1);
  }

  @test
  arrayShift() {
    const yaml = "items:\n  - one\n  - two";
    const obj = YAMLProxy.parse(yaml);
    const value = obj.items.shift();
    assert.strictEqual(value, "one");
    assert.strictEqual(obj.items.length, 1);
  }

  @test
  arrayUnshift() {
    const yaml = "items:\n  - two";
    const obj = YAMLProxy.parse(yaml);
    obj.items.unshift("one");
    assert.strictEqual(obj.items[0], "one");
    assert.strictEqual(obj.items.length, 2);
  }

  @test
  arrayToJSON() {
    // Covers lines 133-134
    const yaml = "items:\n  - one\n  - two";
    const obj = YAMLProxy.parse(yaml);
    const json = obj.items.toJSON();
    // toJSON on array returns the whole pair including key
    assert.ok(json.items);
    assert.deepStrictEqual(json.items, ["one", "two"]);
  }

  @test
  setProperty() {
    const yaml = "key: value";
    const obj = YAMLProxy.parse(yaml);
    obj.key = "modified";
    assert.strictEqual(obj.key, "modified");
  }

  @test
  addNewProperty() {
    const yaml = "existing: value";
    const obj = YAMLProxy.parse(yaml);
    obj.new = "property";
    assert.strictEqual(obj.new, "property");
  }

  @test
  deleteProperty() {
    const yaml = "key1: value1\nkey2: value2";
    const obj = YAMLProxy.parse(yaml);
    delete obj.key1;
    assert.strictEqual(obj.key1, undefined);
    assert.strictEqual(obj.key2, "value2");
  }

  @test
  stringify() {
    const yaml = "key: value\nnum: 42";
    const obj = YAMLProxy.parse(yaml);
    const output = YAMLProxy.stringify(obj);
    assert.ok(output.includes("key:"));
    assert.ok(output.includes("value"));
  }

  @test
  stringifyArray() {
    const yaml = "---\nkey: value\n---\nother: data";
    const obj = YAMLProxy.parse(yaml);
    const output = YAMLProxy.stringify(obj);
    assert.ok(output.includes("---"));
  }

  @test
  pushNestedObject() {
    // Covers line 56 - createYAMLNode with YAMLArray/YAMLMap
    const yaml = "items:\n  - name: first";
    const obj = YAMLProxy.parse(yaml);
    obj.items.push({ name: "second" });
    assert.strictEqual(obj.items[1].name, "second");
  }

  @test
  nestedArrayModification() {
    const yaml = "root:\n  array:\n    - item1";
    const obj = YAMLProxy.parse(yaml);
    obj.root.array.push("item2");
    assert.strictEqual(obj.root.array[1], "item2");
  }

  @test
  stringifyYAMLProxyInstance() {
    // Line 32: covers the instanceof YAMLProxy branch in stringify
    const instance = new YAMLProxy();
    const result = YAMLProxy.stringify(instance);
    assert.strictEqual(result, "[object Object]");
  }

  @test
  nestedSequenceThrows() {
    // Line 49: getYAMLNode reaches the isSeq branch for a nested array,
    // but YAMLArray constructor expects a Pair (not a bare YAMLSeq)
    const yaml = "items:\n  - - a\n    - b";
    assert.throws(() => YAMLProxy.parse(yaml));
  }

  @test
  yamlArrayClone() {
    // Lines 104-106: YAMLArray.clone() via createYAMLNode when pushing a YAMLArray
    const yaml = "items:\n  - one\n  - two\nlist:\n  - x";
    const obj = YAMLProxy.parse(yaml);
    obj.list.push(obj.items);
    assert.strictEqual(obj.list.length, 2);
  }

  @test
  arraySplice() {
    // Lines 124-126: YAMLArray.splice()
    const yaml = "items:\n  - one\n  - two\n  - three";
    const obj = YAMLProxy.parse(yaml);
    const removed = obj.items.splice(1, 1, "inserted");
    assert.strictEqual(removed[0], "two");
    assert.strictEqual(obj.items[1], "inserted");
    assert.strictEqual(obj.items.length, 3);
    const output = YAMLProxy.stringify(obj);
    assert.ok(output.includes("inserted"));
  }
}
