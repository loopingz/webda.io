import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Ident } from "./ident";
import { WebdaApplicationTest } from "../test/test";

@suite
class IdentTest extends WebdaApplicationTest {
  @test getType() {
    // Just for COV
    const user: Ident = new Ident();
    user.setType("plop");
    assert.strictEqual(user.getType(), "plop");
  }
}
