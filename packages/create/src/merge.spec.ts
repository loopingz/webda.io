import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { deepMerge } from "./merge.js";

@suite
class MergeTest {
  @test
  mergesNestedObjects() {
    const target = { services: { A: { type: "X", port: 1 } }, keep: true };
    const result = deepMerge(target, { services: { A: { port: 2 }, B: { type: "Y" } } });
    assert.deepStrictEqual(result, { services: { A: { type: "X", port: 2 }, B: { type: "Y" } }, keep: true });
    assert.deepStrictEqual(target, { services: { A: { type: "X", port: 1 } }, keep: true }, "target is not mutated");
  }

  @test
  replacesArraysAndPrimitives() {
    assert.deepStrictEqual(deepMerge({ list: [1, 2], v: "a" }, { list: [3], v: "b" }), { list: [3], v: "b" });
    assert.deepStrictEqual(deepMerge({ v: { nested: 1 } }, { v: "flat" }), { v: "flat" });
  }
}
