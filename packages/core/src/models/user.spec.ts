import { beforeAll, suite, test } from "@webda/test";
import * as assert from "assert";
import { User } from "./user";
import { SimpleUser } from "./simpleuser";
import { WebdaApplicationTest } from "../test/application";
import { MemoryRepository, registerRepository, useRepository } from "@webda/models";

@suite
class UserTest extends WebdaApplicationTest {
  simpleUserRepo: MemoryRepository<typeof SimpleUser>;
  userRepo: MemoryRepository<typeof User>;

  async beforeAll(init?: boolean): Promise<void> {
    await super.beforeAll(init);
    console.log("Register SimpleUser repo");
    this.simpleUserRepo = new MemoryRepository(SimpleUser, ["uuid"]);
    registerRepository(SimpleUser, this.simpleUserRepo);
    this.userRepo = new MemoryRepository(User, ["uuid"]);
    registerRepository(User, this.userRepo);
  }

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
    const uuid = user.getUUID();
    assert.notStrictEqual(uuid, undefined);
    assert.deepStrictEqual(user.toPublicEntry(), {
      avatar: undefined,
      displayName: undefined,
      email: undefined,
      uuid
    });
    user.deserialize({ _idents: [{}, { email: "testIdent@test.com" }] });
    assert.strictEqual(user.getEmail(), "testIdent@test.com");
    user.deserialize({ email: "test@test.com", displayName: "Top" });
    assert.strictEqual(user.getEmail(), "test@test.com");
    assert.strictEqual(user.getDisplayName(), "Top");
    assert.deepStrictEqual(user.toPublicEntry(), {
      avatar: undefined,
      displayName: "Top",
      email: "test@test.com",
      uuid: user.getUUID()
    });
  }
}
