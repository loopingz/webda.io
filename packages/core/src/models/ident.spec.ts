import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { Ident } from "./ident";

@suite
class IdentTest {
  @test getType() {
    // Just for COV
    const user: Ident = new Ident();
    user.setType("plop");
    assert.strictEqual(user.getType(), "plop");
  }
}
