import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import { WebdaTest } from "./test";

@suite
class RouterTest extends WebdaTest {
  @test
  testGetRouteMethodsFromUrl() {
    this.webda.addRoute("/plop", { method: "GET" });
    assert.deepEqual(this.webda.getRouter().getRouteMethodsFromUrl("/"), ["GET", "POST"]);
    assert.deepEqual(this.webda.getRouter().getRouteMethodsFromUrl("/plop"), ["GET"]);
  }
}
