import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";

@suite
class PrivateFieldsTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  @test
  async writeStripsDoubleUnderscore() {
    const ctx = await this.newContext();
    ctx.write({ a: 1, __password: "x", password: { __hash: "h", changedAt: 2 } });
    const body = JSON.parse(<string>ctx.getResponseBody());
    assert.deepStrictEqual(body, { a: 1, password: { changedAt: 2 } });
  }
}
