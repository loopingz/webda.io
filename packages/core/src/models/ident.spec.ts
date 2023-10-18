import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { Ident } from "./ident";

@suite
class IdentTest {
  @test getType() {
    // Just for COV
    let user: Ident = new Ident();
    user.setType("plop");
    assert.strictEqual(user.getType(), "plop");
  }

  @test init() {
    let ident = Ident.init("ploP", "Me", "t1", "t2", { test: "ok" });
    assert.strictEqual(ident._type, "plop");
    assert.strictEqual(ident.uid, "me");
    assert.strictEqual(ident.uuid, "me_plop");
    assert.strictEqual((<any>ident.__profile).test, "ok");
    assert.strictEqual(ident.__tokens.access, "t1");
    assert.strictEqual(ident.__tokens.refresh, "t2");
    ident = Ident.init("ploP", "Me");
    assert.deepStrictEqual(ident.__profile, {});
    assert.strictEqual(ident.__tokens.access, "");
    assert.strictEqual(ident.__tokens.refresh, "");
    assert.strictEqual(ident.getEmail(), undefined);
    ident.email = "test@test.com";
    assert.strictEqual(ident.getEmail(), "test@test.com");
  }
}
