import { suite, test } from "@webda/test";
import * as assert from "assert";
import { JSONUtils } from "@webda/utils";
import { WebdaApplicationTest } from "../test/application.js";
import { TestApplication } from "../test/objects.js";
import { User } from "./user.model.js";
import { MAX_DEVICES, UserKeys, UserKeysParameters, assertB64u, checkPublicJwk } from "./userkeys.model.js";
import { callOperation, listOperations } from "../core/operations.js";
import { AuditService } from "../services/audit.model.js";
import * as WebdaError from "../errors/errors.js";
import { Throttled } from "../errors/mfa.js";
import { runWithContext } from "../contexts/execution.js";
import { SealedFormatError } from "../errors/sealed.js";
import {
  b64u,
  createEscrowBlob,
  createKeyringKey,
  decryptKeyring,
  encryptKeyring,
  generateUserKeyPair,
  openEscrowBlob,
  type EscrowBlob,
  type KeyringBlob
} from "../sealed/index.js";

const PASSWORD = "correct horse battery staple";

type KeyMaterial = Awaited<ReturnType<typeof generateUserKeyPair>>;

/**
 * Shape-valid escrow blob without real key material (validation only)
 * @param kind - escrow kind
 * @param kid - active key id it claims
 * @returns the blob
 */
function fakeEscrow(kind: "password" | "recovery", kid: string = "k1"): EscrowBlob {
  const rnd = (n: number) => b64u.encode(globalThis.crypto.getRandomValues(new Uint8Array(n)));
  return {
    v: 1,
    kind,
    kid,
    kdf: "argon2id",
    kdfParams: { m: 65536, t: 3, p: 1 },
    salt: rnd(16),
    iv: rnd(12),
    ct: rnd(48)
  };
}

@suite
class UserKeysTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        DomainService: { type: "Webda/DomainService" },
        UserStore: { type: "Webda/MemoryStore", models: ["Webda/User", "Webda/Ident"] }
      }
    };
  }

  /**
   * Resolve unqualified models to the Webda namespace so the DomainService exposes `Webda/User` (`User.Keys.*`), as in
   * an application using the framework User
   * @param app - test application
   */
  async tweakApp(app: TestApplication): Promise<void> {
    app.getNamespace = () => "Webda";
  }

  audits: AuditService[] = [];

  async afterEach(): Promise<void> {
    for (const audit of this.audits.splice(0)) {
      await audit.stop();
    }
    await super.afterEach();
  }

  /**
   * Create a stored user
   * @param name - user name
   * @returns its unique id
   */
  async newUser(name: string): Promise<string> {
    const uuid = `${name}-${++this.users}`;
    await User.create({ uuid, displayName: name } as any);
    return uuid;
  }

  /** Users created so far: the store is shared by the tests of the suite */
  users = 0;

  /**
   * Real enrollment material: key pair, keyring encrypted with a keyring key, password escrow (PBKDF2 for speed)
   * @param userId - owner
   * @param previous - keys already in the keyring (rotation)
   * @param keyringKey - keyring key to reuse
   */
  async material(userId: string, previous: KeyMaterial[] = [], keyringKey?: CryptoKey) {
    const pair = await generateUserKeyPair();
    const all = [...previous, pair];
    const keys: Record<string, string> = {};
    for (const p of all) {
      keys[p.kid] = b64u.encode(new Uint8Array(await crypto.subtle.exportKey("pkcs8", p.privateKey)));
    }
    keyringKey ??= await createKeyringKey();
    const pubs = all.map(p => ({ kid: p.kid, jwk: p.publicJwk }));
    const keyring = await encryptKeyring({ keys, active: pair.kid }, keyringKey, userId, pubs);
    const escrow = await createEscrowBlob("password", PASSWORD, keyringKey, userId, pair.kid, "pbkdf2-sha256");
    return {
      pair,
      keyringKey,
      publicKey: { kid: pair.kid, jwk: pair.publicJwk },
      keyring,
      escrows: { password: escrow }
    };
  }

  /**
   * Log a user in a context, authenticated now
   * @param ctx - context
   * @param userId - user
   * @returns the session
   */
  async session(ctx: any, userId: string): Promise<any> {
    const session = ctx.getSession();
    session.login(userId, `${userId}:email`);
    session.authAt = Date.now();
    return session;
  }

  /**
   * Call a User.Keys operation as a user
   * @param caller - logged user
   * @param uuid - target user
   * @param action - operation suffix, e.g. "Setup"
   * @param body - operation input
   * @param session - session overrides (default: authenticated now)
   * @returns the parsed output
   */
  async op(caller: string, uuid: string, action: string, body: any = {}, session: any = {}): Promise<any> {
    const ctx = await this.newContext(body);
    await ctx.init();
    ctx.setParameters({ uuid });
    Object.assign(await this.session(ctx, caller), session);
    await callOperation(ctx, `User.Keys.${action}`);
    const out = ctx.getOutput();
    return out ? JSON.parse(out) : undefined;
  }

  /**
   * @param uuid - user id
   * @returns the stored keys behavior
   */
  async keysOf(uuid: string): Promise<UserKeys> {
    return (await User.ref(uuid).get()).keys!;
  }

  @test
  hydratedOnUser() {
    assert.ok(new User({ uuid: "h" } as any).keys instanceof UserKeys);
    const user = new User({
      uuid: "h2",
      keys: { publicKeys: [], devices: [{ id: "d", name: "n", createdAt: 1 }] }
    } as any);
    assert.ok(user.keys instanceof UserKeys);
    assert.strictEqual(user.keys.devices[0].id, "d");
    assert.strictEqual(user.keys.getActivePublicKey(), undefined);
    assert.strictEqual(user._escrowAttempts, 0);
    const ops = listOperations();
    for (const action of [
      "Setup",
      "GetEscrow",
      "SetEscrow",
      "RemoveEscrow",
      "GetKeyring",
      "Rotate",
      "RegisterDevice",
      "RevokeDevice"
    ]) {
      assert.ok(ops[`User.Keys.${action}`], `User.Keys.${action} registered ${Object.keys(ops).join(",")}`);
    }
  }

  @test
  async setupOnce() {
    const alice = await this.newUser("alice");
    const m = await this.material(alice);
    assert.strictEqual(await this.op(alice, alice, "Setup", m), undefined);
    const keys = await this.keysOf(alice);
    assert.strictEqual(keys.publicKeys.length, 1);
    assert.strictEqual(keys.publicKeys[0].kid, m.pair.kid);
    assert.strictEqual(keys.publicKeys[0].alg, "ECDH-ES+A256GCM");
    assert.ok(keys.publicKeys[0].createdAt > 0);
    assert.strictEqual(keys.publicKeys[0].retiredAt, undefined);
    assert.deepStrictEqual(keys.getActivePublicKey(), { kid: m.pair.kid, jwk: m.pair.publicJwk });
    assert.deepStrictEqual(keys.__keyring, m.keyring);
    assert.deepStrictEqual(keys.__escrows, m.escrows);
    // Server-only data never reaches a public output
    const out = JSONUtils.stringify(await User.ref(alice).get(), undefined, 0, true);
    assert.ok(!out.includes(m.keyring.ct));
    assert.ok(!out.includes(m.escrows.password.ct));
    assert.ok(out.includes(m.pair.kid));
    // Once only
    const again = await this.material(alice);
    await assert.rejects(() => this.op(alice, alice, "Setup", again), WebdaError.Conflict);
    assert.strictEqual((await this.keysOf(alice)).publicKeys[0].kid, m.pair.kid);
  }

  @test
  async replaceEscrowInMemory() {
    // For a host operation storing the escrow itself (the password change of @webda/auth): validated, not saved
    const alice = await this.newUser("alice");
    const m = await this.material(alice);
    await this.op(alice, alice, "Setup", m);
    const keys = await this.keysOf(alice);
    assert.ok(keys.hasEscrow("password"));
    assert.ok(!keys.hasEscrow("recovery"));
    const recovery = fakeEscrow("recovery", m.pair.kid);
    keys.replaceEscrow("recovery", recovery);
    assert.deepStrictEqual(keys.__escrows, { ...m.escrows, recovery });
    assert.deepStrictEqual((await this.keysOf(alice)).__escrows, m.escrows);
    assert.throws(() => keys.replaceEscrow("recovery", fakeEscrow("password", m.pair.kid)), SealedFormatError);
    // Made for another key than the active one (a device that missed a rotation), or without kid
    assert.throws(() => keys.replaceEscrow("recovery", fakeEscrow("recovery", "stale")), WebdaError.PreconditionFailed);
    assert.throws(
      () => keys.replaceEscrow("recovery", { ...recovery, kid: undefined } as any),
      (e: any) => e instanceof SealedFormatError && /kid must be the active key id/.test(e.message)
    );
    assert.deepStrictEqual(keys.__escrows, { ...m.escrows, recovery });
    assert.throws(() => keys.hasEscrow("other" as any), SealedFormatError);
    // Before setup
    const fresh = new UserKeys();
    assert.ok(!fresh.hasEscrow("password"));
    assert.throws(() => fresh.replaceEscrow("password", fakeEscrow("password")), WebdaError.PreconditionFailed);
  }

  @test
  async ownerOnly() {
    const alice = await this.newUser("alice");
    const bob = await this.newUser("bob");
    const m = await this.material(alice);
    // Another user cannot even see the target user (User.canAct / getPermissionQuery)
    const refused = (action: string, body: any) =>
      assert.rejects(
        () => this.op(bob, alice, action, body),
        (e: any) => [403, 404].includes(e.getResponseCode())
      );
    await refused("Setup", m);
    assert.strictEqual((await this.keysOf(alice)).publicKeys.length, 0);
    await this.op(alice, alice, "Setup", m);
    await refused("GetEscrow", { kind: "password" });
    await refused("RegisterDevice", { name: "evil" });
    await refused("SetEscrow", { kind: "recovery", escrow: fakeEscrow("recovery") });
    await refused("RemoveEscrow", { kind: "password" });
    await refused("Rotate", await this.material(alice, [m.pair], m.keyringKey));
    const keys = await this.keysOf(alice);
    assert.strictEqual(keys.devices.length, 0);
    assert.deepStrictEqual(keys.__escrows, m.escrows);
    assert.strictEqual(keys.publicKeys.length, 1);
    assert.strictEqual((await User.ref(alice).get())._escrowAttempts, 0);
  }

  @test
  async getEscrowThrottled() {
    const alice = await this.newUser("alice");
    const m = await this.material(alice);
    await this.op(alice, alice, "Setup", m);
    // The client opens the escrow with the password and checks the keyring against the served public keys
    const res = await this.op(alice, alice, "GetEscrow", { kind: "password" });
    assert.deepStrictEqual(res.escrow, m.escrows.password);
    assert.deepStrictEqual(res.keyring, m.keyring);
    const key = await openEscrowBlob(res.escrow, PASSWORD, alice);
    const { privateKeys } = await decryptKeyring(res.keyring, key, alice, res.publicKeys);
    assert.deepStrictEqual(Object.keys(privateKeys), [m.pair.kid]);
    // Every fetch counts (the unwrap is client-side): 5 allowed by default, then locked
    for (let i = 0; i < 4; i++) {
      await this.op(alice, alice, "GetEscrow", { kind: "password" });
    }
    await assert.rejects(() => this.op(alice, alice, "GetEscrow", { kind: "password" }), Throttled);
    // Nothing resets the counter, not even a device registration (a key save keeps it)
    await this.op(alice, alice, "RegisterDevice", { name: "laptop" });
    assert.strictEqual((await User.ref(alice).get())._escrowAttempts, 6);
    await assert.rejects(() => this.op(alice, alice, "GetEscrow", { kind: "password" }), Throttled);
    // The lockout decays: one fetch once it is over, then locked again
    await User.ref(alice).setAttribute("_lastEscrowAttemptAt", Date.now() - 900001);
    assert.ok(await this.op(alice, alice, "GetEscrow", { kind: "password" }));
    await assert.rejects(() => this.op(alice, alice, "GetEscrow", { kind: "password" }), Throttled);
  }

  @test
  async keyWritesKeepConcurrentAttempts() {
    const alice = await this.newUser("alice");
    await this.op(alice, alice, "Setup", await this.material(alice));
    // An instance loaded before concurrent escrow fetches
    const stale = await this.keysOf(alice);
    await this.op(alice, alice, "GetEscrow", { kind: "password" });
    await this.op(alice, alice, "GetEscrow", { kind: "password" });
    const ctx = await this.newContext();
    await ctx.init();
    await this.session(ctx, alice);
    await runWithContext(ctx, () => stale.registerDevice("laptop"));
    // Only `keys` was written: the counter incremented meanwhile is kept
    const user = await User.ref(alice).get();
    assert.strictEqual(user._escrowAttempts, 2);
    assert.strictEqual(user.keys!.devices.length, 1);
  }

  @test
  async getEscrowAudited() {
    const alice = await this.newUser("alice");
    const bob = await this.newUser("bob");
    const audit = this.registerService(new AuditService("Audit", {} as any));
    this.audits.push(audit);
    audit.resolve();
    await audit.init();
    await this.op(alice, alice, "Setup", await this.material(alice));
    await this.op(alice, alice, "GetEscrow", { kind: "password" });
    await assert.rejects(() => this.op(bob, alice, "GetEscrow", { kind: "password" }));
    await assert.rejects(() => this.op(alice, alice, "GetEscrow", { kind: "recovery" }), WebdaError.NotFound);
    const entries = audit.getEntries().filter(e => e.operationId === "User.Keys.GetEscrow");
    assert.deepStrictEqual(
      entries.map(e => [e.userId, e.success, e.subjectKey]),
      [
        [alice, true, alice],
        [bob, false, alice],
        [alice, false, alice]
      ]
    );
    assert.ok(audit.getEntries().some(e => e.operationId === "User.Keys.Setup" && e.success));
  }

  @test
  async rotateRetiresPrevious() {
    const alice = await this.newUser("alice");
    const first = await this.material(alice);
    await assert.rejects(
      () => this.op(alice, alice, "Rotate", first),
      (e: any) => e.getResponseCode() === 412
    );
    await this.op(alice, alice, "Setup", first);
    const second = await this.material(alice, [first.pair], first.keyringKey);
    // The keyring must be encrypted for the new active key
    await assert.rejects(
      () => this.op(alice, alice, "Rotate", { ...second, keyring: first.keyring }),
      SealedFormatError
    );
    // A kid already used cannot come back
    await assert.rejects(() => this.op(alice, alice, "Rotate", first), WebdaError.Conflict);
    // Escrows are optional: the keyring key did not change
    await this.op(alice, alice, "Rotate", { publicKey: second.publicKey, keyring: second.keyring });
    let keys = await this.keysOf(alice);
    assert.strictEqual(keys.publicKeys.length, 2);
    assert.ok(keys.publicKeys[0].retiredAt! > 0);
    assert.strictEqual(keys.publicKeys[1].retiredAt, undefined);
    assert.deepStrictEqual(keys.getActivePublicKey(), second.publicKey);
    assert.deepStrictEqual(keys.__keyring, second.keyring);
    assert.deepStrictEqual(keys.__escrows, first.escrows);
    // Rotating the keyring key replaces the escrows
    const firstRetiredAt = keys.publicKeys[0].retiredAt;
    const third = await this.material(alice, [first.pair, second.pair]);
    await this.op(alice, alice, "Rotate", third);
    keys = await this.keysOf(alice);
    assert.deepStrictEqual(
      keys.publicKeys.map(p => p.retiredAt === undefined),
      [false, false, true]
    );
    assert.strictEqual(keys.publicKeys[0].retiredAt, firstRetiredAt);
    assert.deepStrictEqual(keys.__escrows, third.escrows);
    // The whole keyring opens with the new escrow
    const res = await this.op(alice, alice, "GetEscrow", { kind: "password" });
    const key = await openEscrowBlob(res.escrow, PASSWORD, alice);
    const { privateKeys } = await decryptKeyring(res.keyring, key, alice, res.publicKeys);
    assert.deepStrictEqual(Object.keys(privateKeys).sort(), [first.pair.kid, second.pair.kid, third.pair.kid].sort());
  }

  @test
  async getKeyringUnthrottled() {
    const alice = await this.newUser("alice");
    await assert.rejects(
      () => this.op(alice, alice, "GetKeyring"),
      (e: any) => e.getResponseCode() === 412
    );
    const m = await this.material(alice);
    await this.op(alice, alice, "Setup", m);
    // The encrypted keyring and the public keys, never the escrows; not counted as an escrow fetch
    for (let i = 0; i < 7; i++) {
      const res = await this.op(alice, alice, "GetKeyring");
      assert.deepStrictEqual(Object.keys(res).sort(), ["keyring", "publicKeys"]);
      assert.deepStrictEqual(res.keyring, m.keyring);
      assert.deepStrictEqual(
        res.publicKeys.map((k: any) => k.kid),
        [m.pair.kid]
      );
      assert.ok(!JSON.stringify(res).includes(m.escrows.password.ct));
    }
    assert.strictEqual((await User.ref(alice).get())._escrowAttempts, 0);
    // A device holding the keyring key opens it
    const { privateKeys } = await decryptKeyring(
      (await this.op(alice, alice, "GetKeyring")).keyring,
      m.keyringKey,
      alice,
      [m.publicKey]
    );
    assert.deepStrictEqual(Object.keys(privateKeys), [m.pair.kid]);
    // Owner only
    const bob = await this.newUser("bob");
    await assert.rejects(
      () => this.op(bob, alice, "GetKeyring"),
      (e: any) => [403, 404].includes(e.getResponseCode())
    );
  }

  @test
  async escrowKinds() {
    const alice = await this.newUser("alice");
    await assert.rejects(
      () => this.op(alice, alice, "SetEscrow", { kind: "recovery", escrow: fakeEscrow("recovery") }),
      (e: any) => e.getResponseCode() === 412
    );
    await assert.rejects(
      () => this.op(alice, alice, "RemoveEscrow", { kind: "password" }),
      (e: any) => e.getResponseCode() === 412
    );
    const m = await this.material(alice);
    await this.op(alice, alice, "Setup", m);
    const recovery = fakeEscrow("recovery", m.pair.kid);
    await this.op(alice, alice, "SetEscrow", { kind: "recovery", escrow: recovery });
    assert.deepStrictEqual((await this.op(alice, alice, "GetEscrow", { kind: "recovery" })).escrow, recovery);
    // The blob kind must match the slot, and only known kinds exist
    await assert.rejects(
      () => this.op(alice, alice, "SetEscrow", { kind: "recovery", escrow: fakeEscrow("password", m.pair.kid) }),
      SealedFormatError
    );
    // An escrow made for another key than the active one is refused (412): the device missed a rotation
    await assert.rejects(
      () => this.op(alice, alice, "SetEscrow", { kind: "recovery", escrow: fakeEscrow("recovery", "stale") }),
      (e: any) => e.getResponseCode() === 412 && /another key than the active one/.test(e.message)
    );
    assert.deepStrictEqual((await this.op(alice, alice, "GetEscrow", { kind: "recovery" })).escrow, recovery);
    // After a rotation, escrows are made for the new key
    const next = await this.material(alice, [m.pair], m.keyringKey);
    await this.op(alice, alice, "Rotate", { publicKey: next.publicKey, keyring: next.keyring });
    await assert.rejects(
      () => this.op(alice, alice, "SetEscrow", { kind: "recovery", escrow: fakeEscrow("recovery", m.pair.kid) }),
      (e: any) => e.getResponseCode() === 412
    );
    await this.op(alice, alice, "SetEscrow", { kind: "recovery", escrow: fakeEscrow("recovery", next.pair.kid) });
    // Escrows of a new keyring key must be made for the rotated key
    const third = await this.material(alice, [m.pair, next.pair]);
    await assert.rejects(
      () => this.op(alice, alice, "Rotate", { ...third, escrows: { password: fakeEscrow("password", next.pair.kid) } }),
      (e: any) => e.getResponseCode() === 412
    );
    await this.op(alice, alice, "Rotate", third);
    assert.deepStrictEqual(Object.keys((await this.keysOf(alice)).__escrows!), ["password"]);
    assert.strictEqual((await this.keysOf(alice)).__escrows!.password!.kid, third.pair.kid);
    await this.op(alice, alice, "SetEscrow", { kind: "recovery", escrow: fakeEscrow("recovery", third.pair.kid) });
    await assert.rejects(() =>
      this.op(alice, alice, "SetEscrow", { kind: "device", escrow: { ...recovery, kind: "device" } })
    );
    await assert.rejects(() => this.op(alice, alice, "GetEscrow", { kind: "device" }));
    // Removing escrows: the last one cannot go while no device holds the keyring
    await this.op(alice, alice, "RemoveEscrow", { kind: "password" });
    await assert.rejects(() => this.op(alice, alice, "RemoveEscrow", { kind: "password" }), WebdaError.NotFound);
    await assert.rejects(() => this.op(alice, alice, "RemoveEscrow", { kind: "recovery" }), WebdaError.Conflict);
    await this.op(alice, alice, "RegisterDevice", { name: "phone" });
    await this.op(alice, alice, "RemoveEscrow", { kind: "recovery" });
    assert.deepStrictEqual((await this.keysOf(alice)).__escrows, {});
  }

  @test
  async devicesRegisterRevoke() {
    const alice = await this.newUser("alice");
    await assert.rejects(
      () => this.op(alice, alice, "RegisterDevice", { name: "laptop" }),
      (e: any) => e.getResponseCode() === 412
    );
    const m = await this.material(alice);
    await this.op(alice, alice, "Setup", m);
    const { id } = await this.op(alice, alice, "RegisterDevice", { name: "laptop" });
    const { id: id2 } = await this.op(alice, alice, "RegisterDevice", { name: "phone" });
    assert.ok(typeof id === "string" && id.length > 0 && id !== id2);
    let keys = await this.keysOf(alice);
    assert.deepStrictEqual(
      keys.devices.map(d => [d.id, d.name]),
      [
        [id, "laptop"],
        [id2, "phone"]
      ]
    );
    assert.ok(keys.devices[0].createdAt > 0);
    await assert.rejects(() => this.op(alice, alice, "RegisterDevice", { name: "" }), WebdaError.BadRequest);
    await assert.rejects(
      () => this.op(alice, alice, "RegisterDevice", { name: "x".repeat(129) }),
      WebdaError.BadRequest
    );
    await this.op(alice, alice, "RevokeDevice", { id });
    keys = await this.keysOf(alice);
    assert.deepStrictEqual(
      keys.devices.map(d => d.id),
      [id2]
    );
    await assert.rejects(() => this.op(alice, alice, "RevokeDevice", { id }), WebdaError.NotFound);
    // Never leave neither an escrow nor a device
    await this.op(alice, alice, "RemoveEscrow", { kind: "password" });
    await assert.rejects(() => this.op(alice, alice, "RevokeDevice", { id: id2 }), WebdaError.Conflict);
    await this.op(alice, alice, "SetEscrow", { kind: "recovery", escrow: fakeEscrow("recovery", m.pair.kid) });
    await this.op(alice, alice, "RevokeDevice", { id: id2 });
    assert.deepStrictEqual((await this.keysOf(alice)).devices, []);
    // At most MAX_DEVICES devices
    for (let i = 0; i < MAX_DEVICES; i++) {
      await this.op(alice, alice, "RegisterDevice", { name: `device ${i}` });
    }
    await assert.rejects(() => this.op(alice, alice, "RegisterDevice", { name: "one more" }), WebdaError.Conflict);
    assert.strictEqual((await this.keysOf(alice)).devices.length, MAX_DEVICES);
  }

  @test
  async freshAuthenticationRequired() {
    const alice = await this.newUser("alice");
    const m = await this.material(alice);
    const stale = { authAt: Date.now() - 301000 };
    const unauthorized = (e: any) => e.getResponseCode() === 401 && /Reauthentication required/.test(e.message);
    await assert.rejects(() => this.op(alice, alice, "Setup", m, stale), unauthorized);
    await assert.rejects(() => this.op(alice, alice, "Setup", m, { authAt: undefined }), unauthorized);
    await this.op(alice, alice, "Setup", m);
    const { id } = await this.op(alice, alice, "RegisterDevice", { name: "laptop" });
    const next = await this.material(alice, [m.pair], m.keyringKey);
    const actions: [string, any][] = [
      ["GetEscrow", { kind: "password" }],
      ["SetEscrow", { kind: "recovery", escrow: fakeEscrow("recovery", m.pair.kid) }],
      ["RemoveEscrow", { kind: "password" }],
      ["GetKeyring", {}],
      ["Rotate", { publicKey: next.publicKey, keyring: next.keyring }],
      ["RegisterDevice", { name: "phone" }],
      ["RevokeDevice", { id }]
    ];
    for (const [action, body] of actions) {
      await assert.rejects(() => this.op(alice, alice, action, body, stale), unauthorized, action);
    }
    // Nothing changed, no escrow fetch counted
    const user = await User.ref(alice).get();
    assert.strictEqual(user._escrowAttempts, 0);
    assert.deepStrictEqual(user.keys!.__escrows, m.escrows);
    assert.strictEqual(user.keys!.publicKeys.length, 1);
    assert.strictEqual(user.keys!.devices.length, 1);
    // Within reauthMaxAge every action works
    for (const [action, body] of actions) {
      await this.op(alice, alice, action, body, { authAt: Date.now() - 299000 });
    }
  }

  @test
  async verifiedMfaRequiredWhenEnabled() {
    const alice = await this.newUser("alice");
    const user = await User.ref(alice).get();
    user.mfa!.getFactor("totp").enabledAt = Date.now();
    await user.save();
    assert.ok((await User.ref(alice).get()).mfa!.isEnabled());
    const m = await this.material(alice);
    const refused = (e: any) => e.getResponseCode() === 401 && /MFA/.test(e.message);
    await assert.rejects(() => this.op(alice, alice, "Setup", m), refused);
    // A pending MFA login is not logged in yet: the user cannot even be read
    await assert.rejects(
      () => this.op(alice, alice, "Setup", m, { mfa: "pending" }),
      (e: any) => e.getResponseCode() === 404
    );
    await this.op(alice, alice, "Setup", m, { mfa: "verified" });
    await assert.rejects(() => this.op(alice, alice, "GetEscrow", { kind: "password" }), refused);
    assert.ok(await this.op(alice, alice, "GetEscrow", { kind: "password" }, { mfa: "verified" }));
  }

  @test
  async rejectsPrivateJwk() {
    const alice = await this.newUser("alice");
    const m = await this.material(alice);
    const priv = await crypto.subtle.exportKey("jwk", m.pair.privateKey);
    const keys = await this.keysOf(alice);
    const ctx = await this.newContext();
    await ctx.init();
    await this.session(ctx, alice);
    // Refused by the operation (input schema or behavior checks) and by the behavior itself
    const bad = async (input: any) => {
      await assert.rejects(
        () => this.op(alice, alice, "Setup", input),
        (e: any) => e.getResponseCode() === 400
      );
      await assert.rejects(
        () => runWithContext(ctx, () => keys.setup(input.publicKey, input.keyring, input.escrows)),
        SealedFormatError
      );
    };
    // A private JWK (with d) is refused even when its public part is right
    await bad({ ...m, publicKey: { kid: m.pair.kid, jwk: { ...m.pair.publicJwk, d: priv.d } } });
    // Not a P-256 public key / invalid point / kid not derived from the key
    await bad({ ...m, publicKey: { kid: m.pair.kid, jwk: { ...m.pair.publicJwk, crv: "P-384" } } });
    await bad({ ...m, publicKey: { kid: m.pair.kid, jwk: { ...m.pair.publicJwk, kty: "RSA" } } });
    await bad({ ...m, publicKey: { kid: m.pair.kid, jwk: { ...m.pair.publicJwk, x: m.pair.publicJwk.y } } });
    await bad({ ...m, publicKey: { kid: "AAAAAAAAAAAAAAAA", jwk: m.pair.publicJwk } });
    await bad({ ...m, publicKey: { kid: 1, jwk: m.pair.publicJwk } });
    // Blob shapes
    const keyring: KeyringBlob = m.keyring;
    await bad({ ...m, keyring: { ...keyring, v: 2 } });
    await bad({ ...m, keyring: { ...keyring, iv: "not base64url!" } });
    await bad({ ...m, keyring: { ...keyring, iv: b64u.encode(new Uint8Array(8)) } });
    await bad({ ...m, keyring: { ...keyring, iv: b64u.encode(new Uint8Array(13)) } });
    await bad({ ...m, keyring: { ...keyring, ct: "A".repeat(65537) } });
    await bad({ ...m, escrows: {} });
    await bad({ ...m, escrows: { password: { ...m.escrows.password, v: 2 } } });
    await bad({ ...m, escrows: { password: { ...m.escrows.password, kdf: "scrypt" } } });
    await bad({ ...m, escrows: { password: { ...m.escrows.password, salt: "+/=" } } });
    await bad({ ...m, escrows: { password: { ...m.escrows.password, kdfParams: "x" } } });
    // KDF floors (Argon2id m=65536 t=3 p=1, PBKDF2 600000) and maxima, exact parameter names
    await bad({ ...m, escrows: { password: { ...m.escrows.password, kid: 1 } } });
    const argon = fakeEscrow("password", m.pair.kid);
    for (const kdfParams of [
      { m: 65535, t: 3, p: 1 },
      { m: 65536, t: 2, p: 1 },
      { m: 65536, t: 3, p: 0 },
      { m: 262145, t: 3, p: 1 },
      { m: 65536, t: 11, p: 1 },
      { m: 65536, t: 3, p: 5 },
      { m: 65536, t: 3 },
      { m: 65536, t: 3, p: 1, x: 1 },
      { iterations: 600000 }
    ]) {
      await bad({ ...m, escrows: { password: { ...argon, kdfParams } } });
    }
    for (const iterations of [599999, 2000001, 600000.5]) {
      await bad({ ...m, escrows: { password: { ...m.escrows.password, kdfParams: { iterations } } } });
    }
    await bad({ ...m, escrows: { password: { ...m.escrows.password, kdfParams: { m: 65536, t: 3, p: 1 } } } });
    assert.strictEqual((await this.keysOf(alice)).publicKeys.length, 0);
    // The valid material is still accepted
    await this.op(alice, alice, "Setup", m);
  }

  @test
  async validationHelpers() {
    // Without a length, any non-empty base64url value
    assertB64u(b64u.encode(new Uint8Array(100)), "field");
    assert.throws(() => assertB64u("", "field"), /unexpected length/);
    await assert.rejects(checkPublicJwk("not a jwk", "public key"), SealedFormatError);
    await assert.rejects(checkPublicJwk(null, "public key"), SealedFormatError);
  }

  @test
  async detachedBehavior() {
    const keys = new UserKeys();
    assert.deepStrictEqual(keys.publicKeys, []);
    assert.deepStrictEqual(keys.devices, []);
    // Stored data, missing lists default to empty
    const stored = new UserKeys({ publicKeys: undefined, devices: [{ id: "d", name: "n", createdAt: 1 }] });
    assert.deepStrictEqual(stored.publicKeys, []);
    assert.strictEqual(stored.devices[0].id, "d");
    assert.ok(keys.getParameters() instanceof UserKeysParameters);
    assert.strictEqual(keys.getParameters().escrowAttempts, 5);
    const ctx = await this.newContext();
    await ctx.init();
    await assert.rejects(
      () => runWithContext(ctx, () => keys.registerDevice("laptop")),
      (e: any) => e instanceof WebdaError.BadRequest && /not attached/.test(e.message)
    );
  }

  @test
  async directCallChecks() {
    const alice = await this.newUser("alice");
    const ctx = await this.newContext();
    await ctx.init();
    await this.session(ctx, alice);
    const user = await User.ref(alice).get();
    // Only known escrow kinds, even when the operation input schema is bypassed
    await assert.rejects(() => runWithContext(ctx, () => user.keys!.getEscrow("device" as any)), SealedFormatError);
    // The escrow throttle needs a declared counter on the owner
    (user as any)._escrowAttempts = undefined;
    await assert.rejects(
      () => runWithContext(ctx, () => user.keys!.getEscrow("password")),
      (e: any) => e instanceof WebdaError.CodeError && e.code === "USERKEYS_THROTTLE_UNDECLARED"
    );
    // The last device cannot go when no escrow was ever stored
    user.keys!.devices = [{ id: "d1", name: "laptop", createdAt: 1 }];
    user.keys!.__escrows = undefined;
    await assert.rejects(() => runWithContext(ctx, () => user.keys!.revokeDevice("d1")), WebdaError.Conflict);
  }
}
