import { suite, test } from "mocha-typescript";
import { WebdaTest } from "./test";

@suite
class RouterTest extends WebdaTest {
  @test
  testGetRouteMethodsFromUrl() {
    console.log(this.webda.getRouter().getRouteMethodsFromUrl("/"));
    // TODO Add some assert
  }
}
