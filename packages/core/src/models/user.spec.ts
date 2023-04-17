import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { SimpleUser, User } from "./user";

@suite
class UserTest {
  @test("Verify groups in user") groupManagement() {
    let user: SimpleUser = new SimpleUser();
    user.addGroup("test");
    assert.strictEqual(user.inGroup("test"), true);
    user.addGroup("test");
    assert.strictEqual(user.inGroup("test"), true);
    user.removeGroup("test");
    assert.strictEqual(user.inGroup("test"), false);
    assert.strictEqual(user.inGroup("all"), true);
    user.removeGroup("unknown");
  }

  @test("Verify roles in user") roleManagement() {
    let user: SimpleUser = new SimpleUser();
    user.addRole("test");
    assert.strictEqual(user.hasRole("test"), true);
    user.addRole("test");
    assert.strictEqual(user.hasRole("test"), true);
    user.removeRole("test");
    assert.strictEqual(user.hasRole("test"), false);
    user.removeRole("unknown");
  }

  @test
  userCov() {
    const user = new User();
    assert.deepStrictEqual(user.getRoles(), []);
  }

  @test
  password() {
    let user: User = new User();
    user.setPassword("bouzouf");
  }

  @test
  idents() {
    let user: User = new User();
    assert.deepStrictEqual(user.getIdents(), []);
  }

  @test
  emailGetter() {
    let user: SimpleUser = new SimpleUser();
    assert.strictEqual(user.getEmail(), undefined);
    assert.deepStrictEqual(user.toPublicEntry(), {
      avatar: undefined,
      displayName: undefined,
      uuid: undefined,
      email: undefined
    });
    // @ts-ignore
    user.load({ _idents: [{}, { email: "testIdent@test.com" }] }, true);
    assert.strictEqual(user.getEmail(), "testIdent@test.com");
    user.load({ email: "test@test.com", displayName: "Top" });
    assert.strictEqual(user.getEmail(), "test@test.com");
    assert.strictEqual(user.getDisplayName(), "Top");
    assert.deepStrictEqual(user.toPublicEntry(), {
      avatar: undefined,
      displayName: "Top",
      email: "test@test.com",
      uuid: user.getUuid()
    });
  }
}
