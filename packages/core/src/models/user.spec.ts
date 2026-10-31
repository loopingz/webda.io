import { suite, test } from "@webda/test";
import * as assert from "assert";
import { User } from "./user.model.js";
import { SimpleUser } from "./simpleuser.model.js";
import { UserKeys } from "./userkeys.model.js";
import { WebdaApplicationTest } from "../test/application";
import { MemoryRepository, registerRepository } from "@webda/models";

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
  async keysHydratedFromRawData() {
    // Raw keys data (plain JSON) becomes a UserKeys behavior
    const user = new User({ keys: { publicKeys: [{ kid: "k1" }] } } as any);
    assert.ok(user.keys instanceof UserKeys);
    assert.strictEqual(user.keys.publicKeys[0].kid, "k1");
    // Also when the password and MFA behaviors are already built (their hydration does not run)
    const { password, mfa } = new User();
    const copy = new User({ password, mfa, keys: { publicKeys: [{ kid: "k2" }] } } as any);
    assert.ok(copy.keys instanceof UserKeys);
    assert.strictEqual(copy.keys.publicKeys[0].kid, "k2");
    assert.strictEqual((copy.keys as any).parent.instance, copy);
    // Without keys data: an empty behavior
    const empty = new User({ password, mfa } as any);
    assert.ok(empty.keys instanceof UserKeys);
    assert.deepStrictEqual(empty.keys.publicKeys, []);
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
    user.load({ email: "test@test.com", displayName: "Top" });
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
