import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "./test";

@suite
class RouterTest extends WebdaTest {
  @test
  testGetRouteMethodsFromUrl() {
    this.webda.addRoute("/plop", { method: "GET" });
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/"), ["GET", "POST"]);
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/plop"), ["GET"]);
    this.webda.addRoute("/plop", { method: "POST" });
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/plop"), ["GET", "POST"]);
    let call = [];
    this.webda.log = (level, ...args) => {
      call.push({ level, args });
    };
    this.webda.addRoute("/plop", { method: "GET" });
    assert.deepStrictEqual(call, [{ level: "WARN", args: ["GET /plop overlap with another defined route"] }]);
  }
}
