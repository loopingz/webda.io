import { suite, test } from "@webda/test";
import * as assert from "assert";
import { User } from "./user.model.js";
import { SimpleUser } from "./simpleuser.model.js";
import { UserKeys } from "./userkeys.model.js";
import { WebdaApplicationTest } from "../test/application";
import { MemoryRepository, ModelLink, registerRepository, WEBDA_STORAGE } from "@webda/models";
import { ResourceAcl } from "./aclmodel.js";
import { EncryptedField } from "./encrypted.model.js";
import { Ident, InvalidIdent } from "./ident.model.js";
import { AbstractOwnerModel, OwnerModel } from "./ownermodel.model.js";
import { checkModelParent, checkModelReparent, createModel } from "./permissions.js";
import { RegistryEntry } from "./registry.model.js";
import { RoleModel } from "./rolemodel.model.js";

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
    assert.ok(user.getIdents());
    assert.deepStrictEqual(user.getGroups(), []);
    assert.deepStrictEqual(user.getRoles(), []);
  }

  @test
  async additionalModelsCoverage() {
    // 1. User methods & behaviors storage toJSON
    const u = await User.create({ uuid: "u-cov" }, false);
    assert.deepStrictEqual(u.getGroups(), []);
    assert.strictEqual(u.toString(), "User[u-cov]");
    assert.strictEqual(User.getPermissionQuery(undefined), null);

    (u.mfa as any)[WEBDA_STORAGE].extra = "m";
    assert.strictEqual(u.mfa.toJSON().extra, "m");
    assert.ok((u.mfa as any).parent);

    (u.password as any)[WEBDA_STORAGE].extra = "p";
    assert.strictEqual(u.password.toJSON().extra, "p");
    assert.ok((u.password as any).parent);
    let hashReads = 0;
    Object.defineProperty(u.password, "__hash", {
      configurable: true,
      get: () => (++hashReads <= 2 ? "non-empty" : (123 as any))
    });
    assert.strictEqual(await u.password.verify("plain"), false);

    (u.keys as any)[WEBDA_STORAGE].extra = "k";
    assert.strictEqual(u.keys.toJSON().extra, "k");
    assert.ok((u.keys as any).parent);

    // 2. EncryptedField
    const ef = new EncryptedField();
    (ef as any)[WEBDA_STORAGE].extra = "e";
    assert.strictEqual((ef as any).parent, undefined);
    assert.strictEqual(ef.toJSON().extra, "e");
    const origGetService = this.webda.getService.bind(this.webda);
    this.webda.getService = (() => undefined) as any;
    try {
      await assert.rejects(() => ef.set("bar"), /Encrypted fields require the CryptoService/);
    } finally {
      this.webda.getService = origGetService;
    }

    // 3. ResourceAcl
    const acl = new ResourceAcl();
    acl.fromDto([{ action: "get", type: "UNKNOWN" as any, principal: "u-cov", allow: true }]);
    assert.strictEqual(acl.toDto().length, 1);
    const loggedCtx: any = {
      getCurrentUserId: () => "u-cov",
      getCurrentUser: async () => u
    };
    assert.strictEqual(await acl.canAct(loggedCtx, "get"), "no matching ACE in resource ACL");

    // 4. Context setup
    const unmaskedCtx = await this.newContext();
    await unmaskedCtx.init();
    (unmaskedCtx as any).getCurrentUser = async () => u;

    // 5. Ident accessors and methods
    assert.strictEqual(new InvalidIdent().message, "Invalid ident");
    assert.ok(Ident.getProtectedAttributes().includes("_user"));
    assert.strictEqual(Ident.normalizeEmail(undefined as any), "");
    assert.strictEqual(Ident.parseLegacyUID("a:b"), undefined);
    const ident = new Ident({
      providerUid: "id1",
      provider: "email",
      tokens: new EncryptedField()
    } as any);
    (ident as any).__hydrateBehaviors?.();
    const now = new Date();
    ident.lastUsedAt = now;
    assert.strictEqual(ident.lastUsedAt.getTime(), now.getTime());
    ident.verifiedAt = now;
    assert.strictEqual(ident.verifiedAt.getTime(), now.getTime());
    const link = new ModelLink(User);
    link.set("u-cov");
    ident._user = link;
    assert.strictEqual(ident._user, link);
    ident._user = null as any;
    assert.strictEqual(ident._user, null);
    ident.setUser(u);
    assert.strictEqual(ident.getUser().toString(), "u-cov");
    assert.strictEqual(ident.getEmail(), undefined);
    ident.email = "explicit@test.com";
    assert.strictEqual(ident.getEmail(), "explicit@test.com");
    assert.strictEqual(await ident.canAct(unmaskedCtx, "get"), "You can't act on this ident");
    unmaskedCtx.getSession().login("u-cov", "id1");
    assert.strictEqual(await ident.canAct(unmaskedCtx, "get"), true);
    assert.ok((ident as any).toJSON());

    // 6. OwnerModel
    assert.strictEqual(AbstractOwnerModel.getPermissionQuery(undefined), null);
    const om = new OwnerModel();
    assert.strictEqual(await om.canAct(unmaskedCtx, "get"), "Object does not have an owner");
    assert.ok(om.getOwnerModel());

    // 7. RegistryEntry
    const reg = new RegistryEntry();
    assert.strictEqual(reg.fromDTO(), reg);
    assert.strictEqual(reg.toDTO(), undefined);

    // 8. RoleModel
    class TestRoleModel extends RoleModel {
      permissive = false;
      getRolesMap(): Record<string, string | string[]> {
        return {
          get: "admin",
          list: ["editor", "all"]
        };
      }
      isPermissive(): boolean {
        return this.permissive;
      }
    }
    const rm = new TestRoleModel();
    assert.strictEqual(
      new (class extends RoleModel {
        getRolesMap() {
          return {};
        }
      })().isPermissive(),
      false
    );
    const anonCtx = await this.newContext();
    await assert.rejects(() => rm.getRoles(anonCtx), /No user/);
    assert.strictEqual(await rm.canAct(anonCtx, "unknown"), "No permission for this action defined");
    rm.permissive = true;
    assert.strictEqual(await rm.canAct(anonCtx, "unknown"), true);
    assert.strictEqual(await rm.canAct(unmaskedCtx, "get"), "No permission");
    const cachedSessionCtx: any = {
      getCurrentUserId: () => "u-cov",
      getSession: () => ({ roles: ["admin"] })
    };
    assert.strictEqual(await rm.canAct(cachedSessionCtx, "get"), true);

    // 9. Permissions edge cases
    await checkModelReparent("NonExistentModel" as any, {}, { a: 1 }, anonCtx);

    const modelWithMissingParent: any = {
      Metadata: { Relations: { parent: { attribute: "parent", model: "NonExistentModel" } } }
    };
    await assert.rejects(() => checkModelParent(modelWithMissingParent, "p1", anonCtx), /Object not found/);
    await checkModelReparent(modelWithMissingParent, { parent: "p1" }, { parent: "p1" }, anonCtx);
    await checkModelReparent(modelWithMissingParent, {}, { parent: "" }, anonCtx);
    await assert.rejects(
      () => checkModelReparent(modelWithMissingParent, { parent: "p1" }, { parent: "p2" }, anonCtx),
      /Object not found/
    );

    const failingObject: any = {
      getRepository: () => ({
        create: async () => {
          throw new Error("Database connection lost");
        }
      })
    };
    await assert.rejects(() => createModel(failingObject), /Database connection lost/);
  }
}
