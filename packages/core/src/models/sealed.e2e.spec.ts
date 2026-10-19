import { suite, test } from "@webda/test";
import * as assert from "assert";
import { useWorkerOutput } from "@webda/workout";
import { JSONUtils } from "@webda/utils";
import { WebdaApplicationTest } from "../test/application.js";
import { callOperation } from "../core/operations.js";
import { useModel } from "../application/hooks.js";
import type { SealedField } from "./sealed.model.js";
// The client is exercised from its sources: @webda/core cannot depend on @webda/sealed-client (it depends on core)
import {
  KeyVault,
  MemoryStorage,
  type DeviceKek,
  type KeysApi,
  type ServedPublicKey
} from "../../../sealed-client/src/index.js";

const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "another battery staple horse";
const VALUE = { title: "e2e-secret-title", body: "e2e-secret-body" };

/**
 * End to end: the sample-app `Note` (content sealed to its owner), the real `User.Keys.*` operations and the
 * `KeyVault` of `@webda/sealed-client` on several devices.
 *
 * It lives in core, which owns the test application, the sample-app and the operations: the sample-app has no test
 * runner and sealed-client has no application test harness.
 */
@suite
class SealedEndToEndTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  /** Everything written to the logs and the console during the test */
  logs: string[] = [];
  private restore: (() => void)[] = [];

  async beforeEach(): Promise<void> {
    await super.beforeEach();
    const onMessage = (message: unknown) => this.logs.push(String(JSON.stringify(message)));
    useWorkerOutput().on("message", onMessage);
    this.restore.push(() => useWorkerOutput().off("message", onMessage));
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      const original = console[method];
      console[method] = (...args: unknown[]) => {
        this.logs.push(args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
        return original.apply(console, args as any);
      };
      this.restore.push(() => (console[method] = original));
    }
  }

  async afterEach(): Promise<void> {
    for (const undo of this.restore.splice(0)) undo();
    await super.afterEach();
  }

  /**
   * A `KeysApi` calling the real `User.Keys.*` operations as the user, authenticated now
   * @param userId - the logged user
   * @returns the api
   */
  keysApi(userId: string): KeysApi {
    const User: any = useModel("User");
    const call = async (action: string, body: object = {}) => {
      const ctx = await this.newContext(body);
      await ctx.init();
      ctx.setParameters({ uuid: userId });
      const session = ctx.getSession();
      session.login(userId, `${userId}:email`);
      session.authAt = Date.now();
      await callOperation(ctx, `User.Keys.${action}`);
      const out = ctx.getOutput();
      return out ? JSON.parse(out) : undefined;
    };
    return {
      getKeys: async () => {
        const user = JSON.parse(JSONUtils.stringify(await User.ref(userId).get(), undefined, 0, true));
        return { publicKeys: user.keys.publicKeys as ServedPublicKey[], devices: user.keys.devices };
      },
      setup: (publicKey, keyring, escrows) => call("Setup", { publicKey, keyring, escrows }),
      getEscrow: kind => call("GetEscrow", { kind }),
      setEscrow: (kind, escrow) => call("SetEscrow", { kind, escrow }),
      removeEscrow: kind => call("RemoveEscrow", { kind }),
      getKeyring: () => call("GetKeyring"),
      rotate: (publicKey, keyring, escrows) => call("Rotate", { publicKey, keyring, escrows }),
      registerDevice: name => call("RegisterDevice", { name }),
      revokeDevice: id => call("RevokeDevice", { id })
    };
  }

  /**
   * Call `Note.Content.Set` as a user, authenticated now
   * @param userId - the logged user
   * @param uuid - the note
   * @param envelope - the client sealed envelope
   */
  async setContent(userId: string, uuid: string, envelope: unknown): Promise<void> {
    const ctx = await this.newContext({ envelope });
    await ctx.init();
    ctx.setParameters({ uuid });
    ctx.getSession().login(userId, `${userId}:email`);
    await callOperation(ctx, "Note.Content.Set");
  }

  /**
   * A fresh device: its own local storage and platform KEK
   * @param userId - the user
   * @returns the vault and its KEK
   */
  async device(userId: string): Promise<{ vault: KeyVault; kek: DeviceKek }> {
    const key = await crypto.subtle.generateKey({ name: "AES-KW", length: 256 }, false, ["wrapKey", "unwrapKey"]);
    return {
      vault: new KeyVault({ userId, api: this.keysApi(userId), storage: new MemoryStorage() }),
      kek: { kind: "platform", key }
    };
  }

  /**
   * Every row of the stores holding users and notes, as text
   * @returns the raw rows
   */
  rows(): string {
    const texts: string[] = [];
    for (const name of ["User", "Note"]) {
      const repository: any = (useModel(name) as any).getRepository();
      texts.push(...[...((repository.repository ?? repository).storage as Map<string, string>).values()]);
    }
    return texts.join("\n");
  }

  @test
  async notesSealedToTheOwnerOnSeveralDevices() {
    const User: any = useModel("User");
    const Note: any = useModel("Note");
    const user = await User.create({ uuid: "alice", displayName: "alice" });
    const userId = String(user.getPrimaryKey());

    // Device A enrolls: password and recovery code escrows
    const a = await this.device(userId);
    const { recoveryCode } = await a.vault.enroll({
      password: PASSWORD,
      device: a.kek,
      deviceName: "device A",
      recovery: true
    });
    assert.ok(recoveryCode);

    // The server seals a note to the owner: it never sees the content again
    const note = new Note();
    note.setOwner(userId);
    await (note.content as SealedField).seal(VALUE);
    await Note.getRepository().create(note);
    const ctx = { modelType: "WebdaDemo/Note", uuid: String(note.getPrimaryKey()), field: "content" };
    const envelope = (await Note.ref(ctx.uuid).get()).content.toJSON();
    assert.ok(!JSON.stringify(envelope).includes("e2e-secret"));

    // A opens it
    assert.deepStrictEqual(await a.vault.open(envelope, ctx), VALUE);

    // Device B is added with the password escrow, and opens the same note
    const b = await this.device(userId);
    await assert.rejects(() => b.vault.unlock(b.kek));
    await b.vault.unlockWithEscrow({ password: PASSWORD }, { device: b.kek, deviceName: "device B" });
    assert.deepStrictEqual(await b.vault.open(envelope, ctx), VALUE);
    assert.deepStrictEqual(
      (await this.keysApi(userId).getKeys()).devices.map(d => d.name),
      ["device A", "device B"]
    );

    // Password change: the escrow follows it, existing devices are unaffected
    await a.vault.changePassword(NEW_PASSWORD);
    b.vault.lock();
    await b.vault.unlock(b.kek);
    assert.deepStrictEqual(await b.vault.open(envelope, ctx), VALUE);
    assert.deepStrictEqual(await a.vault.open(envelope, ctx), VALUE);
    const c0 = await this.device(userId);
    await assert.rejects(() => c0.vault.unlockWithEscrow({ password: PASSWORD }, { device: c0.kek, deviceName: "x" }));

    // The recovery code adds device C
    const c = await this.device(userId);
    await c.vault.unlockWithEscrow({ recoveryCode: recoveryCode! }, { device: c.kek, deviceName: "device C" });
    assert.deepStrictEqual(await c.vault.open(envelope, ctx), VALUE);

    // What the server stored and logged holds no plaintext, no secret and no private key. Imported private keys are not
    // extractable, so their bytes cannot be searched for: the rows must carry no private JWK member (`d`) and the
    // keyring only as the ciphertext the server was given.
    const secrets = ["e2e-secret", PASSWORD, NEW_PASSWORD, recoveryCode!, recoveryCode!.replace(/-/g, "")];
    const scanned = [this.rows(), this.logs.join("\n")];
    for (const text of scanned) {
      for (const secret of secrets) {
        assert.ok(!text.includes(secret), `leaked ${secret.slice(0, 8)}...`);
      }
      assert.ok(!/"d":\s*"/.test(text), "private JWK member in the rows");
    }
    assert.ok(this.rows().includes(String(envelope.ct)), "the envelope is stored");
  }
  @test
  async clientSealedValueStoredWithSet() {
    const User: any = useModel("User");
    const Note: any = useModel("Note");
    const alice = String((await User.create({ uuid: "alice-set", displayName: "alice" })).getPrimaryKey());
    const bob = String((await User.create({ uuid: "bob-set", displayName: "bob" })).getPrimaryKey());
    const a = await this.device(alice);
    await a.vault.enroll({ password: PASSWORD, device: a.kek, deviceName: "device A" });
    const note = new Note();
    note.setOwner(alice);
    note.public = true;
    await Note.getRepository().create(note);
    const uuid = String(note.getPrimaryKey());
    const ctx = { modelType: "WebdaDemo/Note", uuid, field: "content" };

    // Device A seals locally and stores the envelope: the server never sees the value
    const envelope = await a.vault.seal(VALUE, ctx);
    await this.setContent(alice, uuid, envelope);
    const stored = await Note.ref(uuid).get();
    assert.deepStrictEqual(stored.content.toJSON(), envelope);
    // Only the field was written
    assert.strictEqual(stored.public, true);
    assert.strictEqual(stored.getOwner()?.toString(), alice);

    // Another device opens it
    const b = await this.device(alice);
    await b.vault.unlockWithEscrow({ password: PASSWORD }, { device: b.kek, deviceName: "device B" });
    assert.deepStrictEqual(await b.vault.open(stored.content.toJSON(), ctx), VALUE);

    // Malformed envelopes: 400, nothing stored
    const bad = async (value: unknown) =>
      assert.rejects(
        () => this.setContent(alice, uuid, value),
        (e: any) => e.getResponseCode?.() === 400
      );
    const { d: _d, ...epk } = { ...envelope.epk, d: undefined } as any;
    await bad({ ...envelope, v: 2 });
    await bad({ ...envelope, iv: "AAAA" });
    await bad({ ...envelope, iv: "not base64url!" });
    await bad({ ...envelope, ct: "AAAA" });
    await bad({ ...envelope, kid: 12 });
    await bad({ ...envelope, epk: { ...epk, d: envelope.iv } });
    await bad({ ...envelope, epk: { ...epk, crv: "P-384" } });
    await bad({ ...envelope, epk: { ...epk, x: envelope.epk.y } });
    await bad({ v: 1, kid: envelope.kid });
    await bad(undefined);
    // Sealed to a key other than the recipient active key: 400
    const other = await this.device(bob);
    await other.vault.enroll({ password: PASSWORD, device: other.kek, deviceName: "bob device" });
    await bad(await other.vault.seal(VALUE, ctx));
    await bad({ ...envelope, kid: "AAAAAAAAAAAAAAAA" });
    assert.deepStrictEqual((await Note.ref(uuid).get()).content.toJSON(), envelope);

    // Another user cannot write the note
    await assert.rejects(
      () => this.setContent(bob, uuid, envelope),
      (e: any) => [403, 404].includes(e.getResponseCode?.())
    );

    // After a rotation, only the new active key is accepted
    await a.vault.rotate();
    await bad(envelope);
    const rotated = await a.vault.seal({ ...VALUE, title: "rotated" }, ctx);
    await this.setContent(alice, uuid, rotated);
    assert.deepStrictEqual(await a.vault.open((await Note.ref(uuid).get()).content.toJSON(), ctx), {
      ...VALUE,
      title: "rotated"
    });
    // Device B refreshes its stale keyring through User.Keys.GetKeyring and opens the new value
    b.vault.lock();
    await b.vault.unlock(b.kek);
    assert.deepStrictEqual(await b.vault.open((await Note.ref(uuid).get()).content.toJSON(), ctx), {
      ...VALUE,
      title: "rotated"
    });
    assert.strictEqual((await User.ref(alice).get())._escrowAttempts, 1);
  }
}
