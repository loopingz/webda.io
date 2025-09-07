import { beforeAll, suite, test } from "@webda/test";
import * as assert from "assert";
import { User } from "./user";
import { SimpleUser } from "./simpleuser";
import { WebdaApplicationTest } from "../test/application";
import { MemoryRepository, registerRepository, useRepository } from "@webda/models";

@suite
class UserTest extends WebdaApplicationTest {
  repo: MemoryRepository<typeof SimpleUser>;
  
  async beforeAll(init?: boolean): Promise<void> {
    await super.beforeAll(init);
    console.log("Register SimpleUser repo");
    this.repo = new MemoryRepository(SimpleUser, ["uuid"]);
    registerRepository(SimpleUser, this.repo);
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
        this.repo = new MemoryRepository(SimpleUser, ["uuid"]);
    registerRepository(SimpleUser, this.repo);
    console.log("Emailgetter", SimpleUser);
    console.log("useRepo", useRepository(SimpleUser));

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
