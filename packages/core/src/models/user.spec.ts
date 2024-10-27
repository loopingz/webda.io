import { suite, test } from "@webda/test";
import * as assert from "assert";
import { User } from "./user";
import { SimpleUser } from "./simpleuser";
import { WebdaApplicationTest } from "../test/test";

@suite
class UserTest extends WebdaApplicationTest {
  @test("Verify groups in user") async groupManagement() {
    const user: SimpleUser = await SimpleUser.create({}, false);
    user.addGroup("test");
    assert.strictEqual(user.inGroup("test"), true);
    user.addGroup("test");
    assert.strictEqual(user.inGroup("test"), true);
    user.removeGroup("test");
    assert.strictEqual(user.inGroup("test"), false);
    assert.strictEqual(user.inGroup("all"), true);
    user.removeGroup("unknown");
  }

  @test("Verify roles in user") async roleManagement() {
    const user: SimpleUser = await SimpleUser.create({}, false);
    user.addRole("test");
    assert.strictEqual(user.hasRole("test"), true);
    user.addRole("test");
    assert.strictEqual(user.hasRole("test"), true);
    user.removeRole("test");
    assert.strictEqual(user.hasRole("test"), false);
    user.removeRole("unknown");
  }

  @test
  async userCov() {
    const user = await User.create({}, false);
    assert.deepStrictEqual(user.getRoles(), []);
  }

  @test
  async password() {
    const user: User = await User.create({}, false);
    user.setPassword("bouzouf");
  }

  @test
  async idents() {
    const user: User = await User.create({}, false);
    assert.deepStrictEqual(user.getIdents(), []);
  }

  @test
  async emailGetter() {
    const user: SimpleUser = await SimpleUser.create({}, false);
    assert.strictEqual(user.getEmail(), undefined);
    assert.deepStrictEqual(user.toPublicEntry(), {
      avatar: undefined,
      displayName: undefined,
      uuid: undefined,
      email: undefined
    });
    // @ts-ignore
    user["load"]({ _idents: [{}, { email: "testIdent@test.com" }] }, true);
    assert.strictEqual(user.getEmail(), "testIdent@test.com");
    user["load"]({ email: "test@test.com", displayName: "Top" });
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
