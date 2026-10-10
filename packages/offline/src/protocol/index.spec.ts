import { suite, test } from "@webda/test";
import * as assert from "assert";
import { refId, serializeKey } from "./index.js";

@suite
class ProtocolTest {
  @test
  singleKey() {
    assert.strictEqual(serializeKey(["uuid"], "abc"), "abc");
    assert.strictEqual(serializeKey(["uuid"], { uuid: "abc", other: 1 }), "abc");
    assert.strictEqual(serializeKey(["id"], 12), "12");
    assert.strictEqual(serializeKey(["uuid"], undefined), undefined);
    assert.strictEqual(serializeKey(["uuid"], { other: 1 }), undefined);
  }

  @test
  compositeKey() {
    assert.strictEqual(serializeKey(["org", "name"], { name: "b", org: "a" }), '["a","b"]');
    assert.strictEqual(serializeKey(["org", "name"], { org: "a" }), undefined);
    assert.strictEqual(serializeKey(["org", "name"], "a"), undefined);
  }

  @test
  refIds() {
    assert.strictEqual(refId({ model: "Test/Note", key: "abc" }), "Test/Note|abc");
  }
}
