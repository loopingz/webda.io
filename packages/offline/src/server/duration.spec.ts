import { suite, test } from "@webda/test";
import * as assert from "assert";
import { parseDuration } from "./duration.js";

@suite
class DurationTest {
  @test
  parses() {
    assert.strictEqual(parseDuration(1500), 1500);
    assert.strictEqual(parseDuration("250ms"), 250);
    assert.strictEqual(parseDuration("5s"), 5000);
    assert.strictEqual(parseDuration("2m"), 120000);
    assert.strictEqual(parseDuration("3h"), 10800000);
    assert.strictEqual(parseDuration("30d"), 2592000000);
    assert.throws(() => parseDuration("soon"), /Invalid duration/);
  }
}
