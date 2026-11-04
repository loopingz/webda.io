import { suite, test } from "@webda/test";
import * as assert from "assert";
import { canonicalJson, flowVersion, type FlowDefinition } from "./graph.js";

@suite
class GraphTest {
  /**
   * A small flow definition
   * @returns the definition
   */
  def(): FlowDefinition {
    return {
      id: "Test.Flow",
      version: "",
      params: ["a"],
      input: { type: "object", properties: { a: { type: "number" } } },
      body: [
        {
          kind: "task",
          id: "flow/Test.Add",
          operation: "Test.Add",
          input: { obj: { a: { var: "a" }, b: { lit: 1 } } }
        },
        { kind: "return", id: "flow/return[1]", value: { var: "a" } }
      ],
      source: "code"
    };
  }

  @test
  canonical() {
    assert.strictEqual(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] }), '{"a":[{"c":2,"d":1}],"b":1}');
    assert.strictEqual(canonicalJson({ a: undefined, b: null }), '{"b":null}');
  }

  @test
  version() {
    const v = flowVersion(this.def());
    assert.match(v, /^[0-9a-f]{64}$/);
    // Stable across key order
    const reordered: any = this.def();
    reordered.body[0] = {
      input: { obj: { b: { lit: 1 }, a: { var: "a" } } },
      operation: "Test.Add",
      id: "flow/Test.Add",
      kind: "task"
    };
    assert.strictEqual(flowVersion(reordered), v);
    // id, input schema and source do not take part
    assert.strictEqual(flowVersion({ ...this.def(), id: "Other.Flow", source: "stored", input: {} }), v);
    // Changes with the body
    const changed = this.def();
    changed.body.pop();
    assert.notStrictEqual(flowVersion(changed), v);
    // Changes with the options and params
    assert.notStrictEqual(flowVersion({ ...this.def(), options: { retries: 2 } }), v);
    assert.notStrictEqual(flowVersion({ ...this.def(), params: ["b"] }), v);
  }
}
