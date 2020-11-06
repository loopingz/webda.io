import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { Ident } from "./ident";

@suite
class IdentTest {
  @test getType() {
    // Just for COV
    let user: Ident = new Ident();
    user.setType("plop");
    assert.strictEqual(user.getType(), "plop");
  }
}
