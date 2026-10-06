import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Session, UnknownSession } from "./session.js";

@suite
class SessionTest {
  @test
  basic() {
    const session = new UnknownSession().getProxy();
    session.plop = "test";
    assert.ok(session.isDirty());
    assert.ok(!session.isLogged());
    session.login("user1", "ident1");
    assert.ok(session.isLogged());
    assert.strictEqual(session.mfa, "none");
    assert.deepStrictEqual(session.amr, []);
    session.logout();
    assert.ok(!session.isLogged());
  }

  @test
  pendingMfa() {
    const session = new Session();
    session.login("user1", "a@b.c:email", { provider: "email", amr: ["pwd"], mfa: "pending" });
    assert.ok(!session.isLogged());
    assert.ok(session.isPending());
    assert.strictEqual(session.provider, "email");
    session.refreshFamily = "fam";
    session.logout();
    assert.strictEqual(session.provider, undefined);
    assert.strictEqual(session.amr, undefined);
    assert.strictEqual(session.mfa, undefined);
    assert.strictEqual(session.refreshFamily, undefined);
  }

  @test
  statelessNotSerialized() {
    const session = new Session();
    session.stateless = true;
    assert.ok(!Object.keys(session).includes("stateless"));
  }
}
