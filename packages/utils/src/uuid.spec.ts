import assert from "assert";
import { WebdaTest, suite, test } from "@webda/test";
import { getUuid } from "./uuid";

@suite
class UuidTest extends WebdaTest {
  @test
  normal() {
    let uuid = getUuid();
    assert.ok(uuid.match(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/), "Should be a valid UUID:" + uuid);
    uuid = getUuid("base64");
    assert.ok(uuid.match(/^[a-zA-Z0-9\-_]{22}$/), "Should be a valid base64 UUID:" + uuid);
    uuid = getUuid("hex");
    assert.ok(uuid.match(/^[a-f0-9]{32}$/), "Should be a valid hex UUID:" + uuid);
  }
}
