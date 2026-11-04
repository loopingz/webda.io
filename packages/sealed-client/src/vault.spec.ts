import {
  createKeyringKey,
  decryptKeyring,
  encryptKeyring,
  fieldAad,
  fingerprint,
  generateUserKeyPair,
  KeyringPinError,
  openEscrowBlob,
  sealValue,
  type EscrowBlob,
  type KeyringBlob
} from "@webda/core/lib/sealed/index.js";
import { describe, expect, it } from "vitest";
import type { KeysApi, ServedDevice, ServedPublicKey, PublicKeyInput } from "./api.js";
import { MemoryStorage } from "./storage.js";
import { DeviceNotEnrolledError, DeviceRevokedError, KeyVault, VaultLockedError } from "./vault.js";

const USER = "user-1";
const CTX = { modelType: "Test/Note", uuid: "note-1", field: "content" };

/** In-memory UserKeys server: same state transitions as the core behavior, every payload recorded */
class FakeServer implements KeysApi {
  publicKeys: ServedPublicKey[] = [];
  keyring?: KeyringBlob;
  escrows: Partial<Record<EscrowBlob["kind"], EscrowBlob>> = {};
  devices: ServedDevice[] = [];
  payloads: unknown[] = [];
  escrowFetches = 0;
  keyringFetches = 0;
  /** registerDevice calls left to fail */
  registerFailures = 0;

  async getKeys() {
    return structuredClone({ publicKeys: this.publicKeys, devices: this.devices });
  }
  /**
   * The server precondition: an escrow is made for the active key
   * @param escrows - submitted escrows
   * @param kid - active key id
   */
  checkEscrows(escrows: Partial<Record<string, EscrowBlob>>, kid: string) {
    for (const escrow of Object.values(escrows)) {
      if (escrow.kid !== kid) throw new Error("412 The escrow was made for another key than the active one");
    }
  }
  async setup(publicKey: PublicKeyInput, keyring: KeyringBlob, escrows: Partial<Record<string, EscrowBlob>>) {
    this.payloads.push({ publicKey, keyring, escrows });
    if (this.publicKeys.length) throw new Error("409 Keys are already set up");
    if (!Object.keys(escrows).length) throw new Error("400 At least one escrow is required");
    this.checkEscrows(escrows, publicKey.kid);
    this.publicKeys = [{ kid: publicKey.kid, jwk: publicKey.jwk, createdAt: Date.now() }];
    this.keyring = keyring;
    this.escrows = structuredClone(escrows);
  }
  async getEscrow(kind: EscrowBlob["kind"]) {
    this.escrowFetches++;
    const escrow = this.escrows[kind];
    if (!escrow || !this.keyring) throw new Error(`404 No ${kind} escrow`);
    return structuredClone({ escrow, keyring: this.keyring, publicKeys: this.publicKeys });
  }
  async setEscrow(kind: EscrowBlob["kind"], escrow: EscrowBlob) {
    this.payloads.push({ kind, escrow });
    this.checkEscrows({ [kind]: escrow }, this.publicKeys.filter(k => k.retiredAt === undefined).pop()!.kid);
    this.escrows[kind] = escrow;
  }
  async removeEscrow(kind: EscrowBlob["kind"]) {
    if (!this.publicKeys.length) throw new Error("412 Keys are not set up");
    if (!this.escrows[kind]) throw new Error(`404 No ${kind} escrow`);
    if (Object.keys(this.escrows).length === 1 && this.devices.length === 0) {
      throw new Error("409 The last escrow cannot be removed while no device is registered");
    }
    delete this.escrows[kind];
  }
  async getKeyring() {
    this.keyringFetches++;
    if (!this.keyring) throw new Error("412 Keys are not set up");
    return structuredClone({ keyring: this.keyring, publicKeys: this.publicKeys });
  }
  async rotate(
    publicKey: PublicKeyInput,
    keyring: KeyringBlob,
    escrows?: Partial<Record<EscrowBlob["kind"], EscrowBlob>>
  ) {
    this.payloads.push({ publicKey, keyring, escrows });
    if (escrows) this.checkEscrows(escrows, publicKey.kid);
    for (const key of this.publicKeys) key.retiredAt ??= Date.now();
    this.publicKeys.push({ kid: publicKey.kid, jwk: publicKey.jwk, createdAt: Date.now() });
    this.keyring = keyring;
    if (escrows) this.escrows = structuredClone(escrows);
  }
  async registerDevice(name: string) {
    if (this.registerFailures-- > 0) throw new Error("401 Reauthentication required");
    const id = `device-${this.devices.length + 1}`;
    this.devices.push({ id, name, createdAt: Date.now() });
    return { id };
  }
  async revokeDevice(id: string) {
    this.devices = this.devices.filter(d => d.id !== id);
  }
  /**
   * What the server does on write: seal to the active public key
   * @param value - plaintext
   * @returns the envelope
   */
  async sealForUser(value: unknown) {
    const active = this.publicKeys.filter(k => k.retiredAt === undefined).pop()!;
    return sealValue(
      value,
      { kid: active.kid, jwk: active.jwk },
      fieldAad(CTX.modelType, CTX.uuid, CTX.field, active.kid)
    );
  }
}

const PASSCODE = { kind: "passcode", passcode: "1234-device" } as const;
const PASSWORD = "correct horse battery staple";

/**
 * A device: its own storage and vault, on the shared server
 * @param server - fake server
 * @param storage - device storage
 * @returns the vault
 */
function device(server: FakeServer, storage = new MemoryStorage()) {
  return { vault: new KeyVault({ userId: USER, api: server, storage }), storage };
}

/**
 * The served active public key replaced by an attacker key, with a keyring the attacker encrypted for it
 * @param server - fake server
 */
async function substituteKey(server: FakeServer) {
  const attacker = await generateUserKeyPair();
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", attacker.privateKey));
  const entry = { kid: attacker.kid, jwk: attacker.publicJwk };
  server.publicKeys = [{ ...entry, createdAt: Date.now() }];
  server.keyring = await encryptKeyring(
    { keys: { [attacker.kid]: Buffer.from(pkcs8).toString("base64url") }, active: attacker.kid },
    await createKeyringKey(),
    USER,
    [entry]
  );
}

describe("KeyVault", () => {
  it("enrollThenOpenServerSealed", async () => {
    const server = new FakeServer();
    const { vault, storage } = device(server);
    expect(vault.isUnlocked).toBe(false);
    const { recoveryCode } = await vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    expect(recoveryCode).toBeUndefined();
    expect(vault.isUnlocked).toBe(true);
    expect(server.devices.map(d => d.name)).toEqual(["laptop"]);
    expect(Object.keys(server.escrows)).toEqual(["password"]);
    // Nothing private or device-bound reaches the server
    const sent = JSON.stringify(server.payloads);
    expect(sent).not.toContain('"d":');
    expect(sent).not.toContain(PASSWORD);
    expect(sent).not.toContain(PASSCODE.passcode);
    const pin = await storage.get(`webda-sealed:pin:${USER}`);
    expect(pin).toBe(await fingerprint(server.publicKeys[0].jwk));
    const deviceBlob = (await storage.get(`webda-sealed:device:${USER}`))!;
    const { salt, wrapped } = JSON.parse(deviceBlob);
    expect(sent).not.toContain(salt);
    expect(sent).not.toContain(wrapped.ct);

    const env = await server.sealForUser({ title: "secret" });
    expect(await vault.open(env, CTX)).toEqual({ title: "secret" });
    // The AAD binds the record and the field
    await expect(vault.open(env, { ...CTX, uuid: "note-2" })).rejects.toThrow();

    // The client seals to its pinned key too
    const own = await vault.seal({ n: 1 }, CTX);
    expect(own.kid).toBe(server.publicKeys[0].kid);
    expect(await vault.open(own, CTX)).toEqual({ n: 1 });

    // A fresh session on the same device unlocks with the passcode, the server is only asked for the public keys
    const again = device(server, storage).vault;
    await expect(again.unlock({ kind: "passcode", passcode: "wrong" })).rejects.toThrow();
    expect(again.isUnlocked).toBe(false);
    await again.unlock(PASSCODE);
    expect(await again.open(env, CTX)).toEqual({ title: "secret" });
    expect(server.escrowFetches).toBe(0);
    // Enrolling twice is refused by the server
    await expect(again.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "x" })).rejects.toThrow("409");
  });

  it("enrolls with a platform KEK and a recovery code only", async () => {
    const server = new FakeServer();
    const { vault, storage } = device(server);
    const key = await crypto.subtle.generateKey({ name: "AES-KW", length: 256 }, false, ["wrapKey", "unwrapKey"]);
    const { recoveryCode } = await vault.enroll({
      device: { kind: "platform", key },
      deviceName: "phone",
      recovery: true
    });
    expect(recoveryCode).toMatch(/^([0-9A-HJKMNP-TV-Z]{5}-){5}[0-9A-HJKMNP-TV-Z]$/);
    expect(Object.keys(server.escrows)).toEqual(["recovery"]);
    const again = device(server, storage).vault;
    await expect(again.unlock(PASSCODE)).rejects.toThrow("platform");
    await again.unlock({ kind: "platform", key });
    expect(await again.open(await server.sealForUser("x"), CTX)).toBe("x");
    // At least one escrow is needed
    await expect(device(new FakeServer()).vault.enroll({ device: PASSCODE, deviceName: "d" })).rejects.toThrow(
      "escrow"
    );
  });

  it("addDeviceViaPassword", async () => {
    const server = new FakeServer();
    await device(server).vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    const env = await server.sealForUser("hello");
    const b = device(server);
    await expect(b.vault.unlock(PASSCODE)).rejects.toThrow("not enrolled");
    await expect(
      b.vault.unlockWithEscrow({ password: "wrong" }, { device: PASSCODE, deviceName: "tablet" })
    ).rejects.toThrow();
    expect(await b.storage.get(`webda-sealed:pin:${USER}`)).toBeUndefined();
    await b.vault.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "tablet" });
    expect(await b.vault.open(env, CTX)).toBe("hello");
    expect(server.devices.map(d => d.name)).toEqual(["laptop", "tablet"]);
    expect(await b.storage.get(`webda-sealed:pin:${USER}`)).toBe(await fingerprint(server.publicKeys[0].jwk));
    // Device B now unlocks locally
    const b2 = device(server, b.storage).vault;
    await b2.unlock(PASSCODE);
    expect(await b2.open(env, CTX)).toBe("hello");
  });

  it("addDeviceViaRecoveryCode", async () => {
    const server = new FakeServer();
    const a = device(server).vault;
    const { recoveryCode } = await a.enroll({
      password: PASSWORD,
      device: PASSCODE,
      deviceName: "laptop",
      recovery: true
    });
    expect(Object.keys(server.escrows).sort()).toEqual(["password", "recovery"]);
    const env = await server.sealForUser({ v: 42 });
    const b = device(server).vault;
    // Typed in lower case without dashes
    const typed = recoveryCode!.replace(/-/g, "").toLowerCase();
    await b.unlockWithEscrow({ recoveryCode: typed }, { device: PASSCODE, deviceName: "new phone" });
    expect(await b.open(env, CTX)).toEqual({ v: 42 });

    // A replaced recovery code invalidates the old one
    const code2 = await a.setRecoveryCode();
    expect(code2).not.toBe(recoveryCode);
    await expect(
      device(server).vault.unlockWithEscrow({ recoveryCode: recoveryCode! }, { device: PASSCODE, deviceName: "c" })
    ).rejects.toThrow();
    const c = device(server).vault;
    await c.unlockWithEscrow({ recoveryCode: code2 }, { device: PASSCODE, deviceName: "c" });
    expect(await c.open(env, CTX)).toEqual({ v: 42 });
  });

  it("pinMismatchRefused", async () => {
    const server = new FakeServer();
    const a = device(server);
    await a.vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    const pin = await a.storage.get(`webda-sealed:pin:${USER}`);
    const original = await server.getKeys();
    await substituteKey(server);

    // Unlocking against a substituted active key
    await expect(device(server, a.storage).vault.unlock(PASSCODE)).rejects.toBeInstanceOf(KeyringPinError);
    // The unlocked vault refuses to seal to an unpinned key
    const attacker = server.publicKeys[0];
    await expect(a.vault.seal("x", CTX, { kid: attacker.kid, jwk: attacker.jwk })).rejects.toBeInstanceOf(
      KeyringPinError
    );
    // A pinned device refuses an escrow served with a substituted keyring
    await expect(
      device(server, a.storage).vault.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "x" })
    ).rejects.toBeInstanceOf(KeyringPinError);
    expect(await a.storage.get(`webda-sealed:pin:${USER}`)).toBe(pin);

    // A new device without a pin cannot open the substituted keyring with the user escrow, and pins nothing
    const b = device(server);
    await expect(
      b.vault.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "b" })
    ).rejects.toBeInstanceOf(KeyringPinError);
    expect(await b.storage.get(`webda-sealed:pin:${USER}`)).toBeUndefined();
    expect(await b.storage.get(`webda-sealed:device:${USER}`)).toBeUndefined();

    // Restored: everything works again
    server.publicKeys = original.publicKeys;
    expect(await a.vault.seal("ok", CTX)).toHaveProperty("kid", original.publicKeys[0].kid);
  });

  it("changePasswordRewraps", async () => {
    const server = new FakeServer();
    const a = device(server).vault;
    await expect(a.changePassword("new password")).rejects.toBeInstanceOf(VaultLockedError);
    await a.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    const b = device(server);
    await b.vault.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "tablet" });
    const before = server.escrows.password;
    await a.changePassword("new password");
    expect(server.escrows.password).not.toEqual(before);
    expect(server.escrows.password!.kid).toBe(server.publicKeys[0].kid);
    expect(JSON.stringify(server.payloads)).not.toContain("new password");
    const env = await server.sealForUser("still readable");
    // Existing devices keep working
    const b2 = device(server, b.storage).vault;
    await b2.unlock(PASSCODE);
    expect(await b2.open(env, CTX)).toBe("still readable");
    // The old password no longer opens the escrow, the new one does
    await expect(
      device(server).vault.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "c" })
    ).rejects.toThrow();
    const c = device(server).vault;
    await c.unlockWithEscrow({ password: "new password" }, { device: PASSCODE, deviceName: "c" });
    expect(await c.open(env, CTX)).toBe("still readable");

    // Locked: the escrow is opened with the old password, then re-wrapped
    const locked = device(server).vault;
    await expect(locked.changePassword("third", { oldPassword: "wrong" })).rejects.toThrow();
    const fetches = server.escrowFetches;
    await locked.changePassword("third", { oldPassword: "new password" });
    expect(server.escrowFetches).toBe(fetches + 1);
    expect(locked.isUnlocked).toBe(false);
    expect(server.escrows.password!.kid).toBe(server.publicKeys[0].kid);
    const d = device(server).vault;
    await d.unlockWithEscrow({ password: "third" }, { device: PASSCODE, deviceName: "d" });
    expect(await d.open(env, CTX)).toBe("still readable");
    // A locked change through a substituted keyring is refused on a pinned device
    await substituteKey(server);
    await expect(
      device(server, b.storage).vault.changePassword("fourth", { oldPassword: "third" })
    ).rejects.toBeInstanceOf(KeyringPinError);
  });

  it("createPasswordEscrowDoesNotSend", async () => {
    // The host sends the blob itself, with its login password change
    const server = new FakeServer();
    const a = device(server).vault;
    await expect(a.createPasswordEscrow("new password")).rejects.toBeInstanceOf(VaultLockedError);
    await a.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    const before = structuredClone(server.escrows);
    const unlocked = await a.createPasswordEscrow("new password");
    const locked = await device(server).vault.createPasswordEscrow("third", { oldPassword: PASSWORD });
    expect(server.escrows).toEqual(before);
    expect(JSON.stringify([unlocked, locked, server.payloads])).not.toContain("new password");
    const env = await server.sealForUser("readable");
    for (const [escrow, password] of [
      [unlocked, "new password"],
      [locked, "third"]
    ] as const) {
      await server.setEscrow("password", escrow);
      const b = device(server).vault;
      await b.unlockWithEscrow({ password }, { device: PASSCODE, deviceName: "b" });
      expect(await b.open(env, CTX)).toBe("readable");
    }
  });

  it("rotateKeepsOldReadable", async () => {
    const server = new FakeServer();
    const a = device(server);
    await a.vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    const b = device(server);
    await b.vault.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "tablet" });
    const oldEnv = await server.sealForUser("old");
    const oldKid = server.publicKeys[0].kid;

    await a.vault.rotate();
    expect(server.publicKeys).toHaveLength(2);
    const newKid = server.publicKeys[1].kid;
    expect(newKid).not.toBe(oldKid);
    expect(await a.storage.get(`webda-sealed:pin:${USER}`)).toBe(await fingerprint(server.publicKeys[1].jwk));
    const newEnv = await server.sealForUser("new");
    expect(newEnv.kid).toBe(newKid);
    expect(await a.vault.open(oldEnv, CTX)).toBe("old");
    expect(await a.vault.open(newEnv, CTX)).toBe("new");
    expect((await a.vault.seal("s", CTX)).kid).toBe(newKid);
    // The rotating device unlocks again after its own rotation
    const a2 = device(server, a.storage).vault;
    await a2.unlock(PASSCODE);
    expect(await a2.open(oldEnv, CTX)).toBe("old");
    expect(await a2.open(newEnv, CTX)).toBe("new");

    // Another device refreshes its stale local keyring (unthrottled, no escrow): the new keyring opens with the keyring
    // key it holds and still holds its pinned private key
    const fetches = server.escrowFetches;
    const b2 = device(server, b.storage).vault;
    await b2.unlock(PASSCODE);
    expect(server.keyringFetches).toBe(1);
    expect(server.escrowFetches).toBe(fetches);
    expect(await b2.open(oldEnv, CTX)).toBe("old");
    expect(await b2.open(newEnv, CTX)).toBe("new");
    expect(await b.storage.get(`webda-sealed:pin:${USER}`)).toBe(await fingerprint(server.publicKeys[1].jwk));
    // The refreshed keyring is kept: the next unlock is local again
    await device(server, b.storage).vault.unlock(PASSCODE);
    expect(server.keyringFetches).toBe(1);
    // The device keeps its registration
    expect(server.devices.map(d => d.name)).toEqual(["laptop", "tablet"]);
  });

  it("refuses a refreshed keyring without the pinned private key", async () => {
    const server = new FakeServer();
    const a = device(server);
    await a.vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    const pin = await a.storage.get(`webda-sealed:pin:${USER}`);
    // A holder of the keyring key serves a keyring that dropped the pinned key
    const keyringKey = await openEscrowBlob(server.escrows.password!, PASSWORD, USER);
    const other = await generateUserKeyPair();
    const entry = { kid: other.kid, jwk: other.publicJwk };
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", other.privateKey));
    server.publicKeys[0].retiredAt = Date.now();
    server.publicKeys.push({ ...entry, createdAt: Date.now() });
    server.keyring = await encryptKeyring(
      { keys: { [other.kid]: Buffer.from(pkcs8).toString("base64url") }, active: other.kid },
      keyringKey,
      USER,
      [entry]
    );
    const again = device(server, a.storage).vault;
    await expect(again.unlock(PASSCODE)).rejects.toThrow(/pinned/);
    expect(again.isUnlocked).toBe(false);
    expect(await a.storage.get(`webda-sealed:pin:${USER}`)).toBe(pin);
  });

  it("refuses writes once the keyring changed on another device", async () => {
    const server = new FakeServer();
    const a = device(server);
    await a.vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    const b = device(server);
    await b.vault.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "tablet" });
    const env = await server.sealForUser("x");

    // B replaces the keyring key: A still holds the old one in memory
    await b.vault.rotate({ newKeyringKey: { device: PASSCODE, password: "rotated" } });
    const escrows = structuredClone(server.escrows);
    await expect(a.vault.changePassword("from A")).rejects.toThrow(/another device/);
    await expect(a.vault.changePassword("from A")).rejects.toBeInstanceOf(KeyringPinError);
    await expect(a.vault.setRecoveryCode()).rejects.toThrow(/another device/);
    // Nothing was written: the escrows still open the new keyring
    expect(server.escrows).toEqual(escrows);
    const c = device(server).vault;
    await c.unlockWithEscrow({ password: "rotated" }, { device: PASSCODE, deviceName: "c" });
    expect(await c.open(env, CTX)).toBe("x");

    // A cannot refresh with the old keyring key: it goes through the new escrow, then writes again
    const a2 = device(server, a.storage).vault;
    await expect(a2.unlock(PASSCODE)).rejects.toBeInstanceOf(KeyringPinError);
    await a2.unlockWithEscrow({ password: "rotated" }, { device: PASSCODE, deviceName: "laptop" });
    await a2.changePassword("from A");
    const d = device(server).vault;
    await d.unlockWithEscrow({ password: "from A" }, { device: PASSCODE, deviceName: "d" });
    expect(await d.open(env, CTX)).toBe("x");

    // A plain rotation keeps the keyring key, writes are still refused until the next unlock refreshes the keyring
    await d.rotate();
    await expect(a2.setRecoveryCode()).rejects.toBeInstanceOf(KeyringPinError);
    const a3 = device(server, a.storage).vault;
    await a3.unlock(PASSCODE);
    expect(await a3.setRecoveryCode()).toBeDefined();
  });

  it("resets the keys when they are lost", async () => {
    const server = new FakeServer();
    const a = device(server);
    await a.vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    const b = device(server);
    await b.vault.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "tablet" });
    const oldEnv = await server.sealForUser("old");
    const oldKid = server.publicKeys[0].kid;

    // Password forgotten, no device at hand, no recovery code: a new device resets the keys
    const c = device(server);
    await expect(c.vault.reset({ device: PASSCODE, deviceName: "phone" })).rejects.toThrow("escrow");
    expect(server.publicKeys).toHaveLength(1);
    const { recoveryCode } = await c.vault.reset({
      password: "new password",
      recovery: true,
      device: PASSCODE,
      deviceName: "phone"
    });
    expect(recoveryCode).toBeDefined();
    expect(c.vault.isUnlocked).toBe(true);
    expect(server.publicKeys).toHaveLength(2);
    expect(server.publicKeys[0].retiredAt).toBeDefined();
    const newKid = server.publicKeys[1].kid;
    expect(await c.storage.get(`webda-sealed:pin:${USER}`)).toBe(await fingerprint(server.publicKeys[1].jwk));
    expect(server.devices.map(d => d.name)).toEqual(["laptop", "tablet", "phone"]);
    expect(Object.keys(server.escrows).sort()).toEqual(["password", "recovery"]);
    // Nothing private reaches the server
    expect(JSON.stringify(server.payloads)).not.toContain("new password");
    expect(JSON.stringify(server.payloads)).not.toContain('"d":');

    // New values open, old ones stay unreadable
    const newEnv = await server.sealForUser("new");
    expect(newEnv.kid).toBe(newKid);
    expect(await c.vault.open(newEnv, CTX)).toBe("new");
    await expect(c.vault.open(oldEnv, CTX)).rejects.toThrow(oldKid);
    const c2 = device(server, c.storage).vault;
    await c2.unlock(PASSCODE);
    expect(await c2.open(newEnv, CTX)).toBe("new");
    // The old escrow is gone
    await expect(
      device(server).vault.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "x" })
    ).rejects.toThrow();

    // The other devices are cut off: their keyring key and pinned key are gone
    await expect(device(server, a.storage).vault.unlock(PASSCODE)).rejects.toBeInstanceOf(KeyringPinError);
    await expect(device(server, b.storage).vault.unlock(PASSCODE)).rejects.toBeInstanceOf(KeyringPinError);
    // The pin also refuses the new escrow, until the user explicitly trusts the new key on that device
    const b2 = device(server, b.storage);
    await expect(
      b2.vault.unlockWithEscrow({ password: "new password" }, { device: PASSCODE, deviceName: "tablet" })
    ).rejects.toBeInstanceOf(KeyringPinError);
    // The UI shows both fingerprints: the user compares the served one with the device that did the reset
    expect(await b2.vault.pinnedFingerprint()).toBe(await fingerprint(server.publicKeys[0].jwk));
    expect(await b2.vault.servedFingerprint()).toBe(await fingerprint(server.publicKeys[1].jwk));
    expect(await c.vault.pinnedFingerprint()).toBe(await b2.vault.servedFingerprint());
    await b2.vault.forgetPin();
    expect(await b.storage.get(`webda-sealed:pin:${USER}`)).toBeUndefined();
    expect(await b2.vault.pinnedFingerprint()).toBeUndefined();
    await b2.vault.unlockWithEscrow({ recoveryCode: recoveryCode! }, { device: PASSCODE, deviceName: "tablet" });
    expect(await b2.vault.open(newEnv, CTX)).toBe("new");
    await expect(b2.vault.open(oldEnv, CTX)).rejects.toThrow(oldKid);
    expect(await b.storage.get(`webda-sealed:pin:${USER}`)).toBe(await fingerprint(server.publicKeys[1].jwk));
    // B kept its registration
    expect(server.devices.map(d => d.name)).toEqual(["laptop", "tablet", "phone"]);
  });

  it("removes the recovery code", async () => {
    const server = new FakeServer();
    const a = device(server);
    await a.vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop", recovery: true });
    await a.vault.removeRecoveryCode();
    expect(Object.keys(server.escrows)).toEqual(["password"]);
    await expect(a.vault.removeRecoveryCode()).rejects.toThrow("404");
    // The server guard surfaces: the last escrow cannot go while no device is registered
    const other = new FakeServer();
    const o = device(other);
    await o.vault.enroll({ device: PASSCODE, deviceName: "phone", recovery: true });
    await other.revokeDevice(other.devices[0].id);
    await expect(o.vault.removeRecoveryCode()).rejects.toThrow("409");
    expect(Object.keys(other.escrows)).toEqual(["recovery"]);
  });

  it("rotates the keyring key to cut off a lost device", async () => {
    const server = new FakeServer();
    const a = device(server);
    await a.vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    const oldEnv = await server.sealForUser("old");
    const oldKeyringKey = await openEscrowBlob(server.escrows.password!, PASSWORD, USER);
    await expect(a.vault.rotate({ newKeyringKey: { device: PASSCODE } })).rejects.toThrow("escrow");

    const platform = await crypto.subtle.generateKey({ name: "AES-KW", length: 256 }, false, ["wrapKey", "unwrapKey"]);
    const { recoveryCode } = await a.vault.rotate({
      newKeyringKey: { device: { kind: "platform", key: platform }, password: "rotated", recovery: true }
    });
    expect(recoveryCode).toBeDefined();
    expect(Object.keys(server.escrows).sort()).toEqual(["password", "recovery"]);
    // The rebuilt escrows are made for the rotated key
    expect(server.escrows.password!.kid).toBe(server.publicKeys.at(-1)!.kid);
    // The old keyring key no longer opens the server keyring
    await expect(decryptKeyring(server.keyring!, oldKeyringKey, USER, server.publicKeys)).rejects.toThrow();
    const newEnv = await server.sealForUser("new");
    expect(await a.vault.open(oldEnv, CTX)).toBe("old");
    expect(await a.vault.open(newEnv, CTX)).toBe("new");
    // The vault keeps working with the new keyring key and the device re-wrapped with its new KEK
    expect(await a.vault.setRecoveryCode()).toBeDefined();
    const a2 = device(server, a.storage).vault;
    await expect(a2.unlock(PASSCODE)).rejects.toThrow("platform");
    await a2.unlock({ kind: "platform", key: platform });
    expect(await a2.open(newEnv, CTX)).toBe("new");
    // Old escrows are gone, the new password opens the new keyring
    await expect(
      device(server).vault.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "x" })
    ).rejects.toThrow();
    const b = device(server).vault;
    await b.unlockWithEscrow({ password: "rotated" }, { device: PASSCODE, deviceName: "b" });
    expect(await b.open(oldEnv, CTX)).toBe("old");
  });

  it("enrollment survives a failed device registration", async () => {
    const server = new FakeServer();
    const a = device(server);
    server.registerFailures = 1;
    const { recoveryCode } = await a.vault.enroll({
      password: PASSWORD,
      device: PASSCODE,
      deviceName: "laptop",
      recovery: true
    });
    expect(recoveryCode).toBeDefined();
    expect(a.vault.isUnlocked).toBe(true);
    expect(server.devices).toEqual([]);
    expect(await a.storage.get(`webda-sealed:pin:${USER}`)).toBeDefined();
    // The next unlock registers the device lazily, once
    await device(server, a.storage).vault.unlock(PASSCODE);
    expect(server.devices.map(d => d.name)).toEqual(["laptop"]);
    await device(server, a.storage).vault.unlock(PASSCODE);
    expect(server.devices).toHaveLength(1);
    expect(JSON.parse((await a.storage.get(`webda-sealed:device:${USER}`))!).deviceId).toBe(server.devices[0].id);
  });

  it("a revoked device deletes its local blob", async () => {
    const server = new FakeServer();
    const a = device(server);
    await a.vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    await server.revokeDevice(server.devices[0].id);
    await expect(device(server, a.storage).vault.unlock(PASSCODE)).rejects.toBeInstanceOf(DeviceRevokedError);
    expect(await a.storage.get(`webda-sealed:device:${USER}`)).toBeUndefined();
    await expect(device(server, a.storage).vault.unlock(PASSCODE)).rejects.toBeInstanceOf(DeviceNotEnrolledError);
    // Added again through the escrow, as a new device
    const again = device(server, a.storage).vault;
    await again.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "laptop" });
    expect(server.devices).toHaveLength(1);
    expect(await again.open(await server.sealForUser("x"), CTX)).toBe("x");
  });

  it("lockDropsKeys", async () => {
    const server = new FakeServer();
    const { vault } = device(server);
    await vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    const env = await server.sealForUser("x");
    vault.lock();
    expect(vault.isUnlocked).toBe(false);
    await expect(vault.open(env, CTX)).rejects.toBeInstanceOf(VaultLockedError);
    await expect(vault.setRecoveryCode()).rejects.toBeInstanceOf(VaultLockedError);
    await expect(vault.rotate()).rejects.toBeInstanceOf(VaultLockedError);
    // Sealing only needs the pinned public key
    expect((await vault.seal("s", CTX)).kid).toBe(server.publicKeys[0].kid);
    await vault.unlock(PASSCODE);
    expect(await vault.open(env, CTX)).toBe("x");
    // An unknown kid is refused
    await expect(vault.open({ ...env, kid: "unknown" }, CTX)).rejects.toThrow("unknown");
  });

  it("pins on unlock when no pin is stored and registers an unnamed device", async () => {
    const server = new FakeServer();
    const a = device(server);
    server.registerFailures = 1;
    await a.vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    const { deviceName: _, ...blob } = JSON.parse((await a.storage.get(`webda-sealed:device:${USER}`))!);
    await a.storage.set(`webda-sealed:device:${USER}`, JSON.stringify(blob));
    await a.storage.delete(`webda-sealed:pin:${USER}`);
    const again = device(server, a.storage).vault;
    await again.unlock(PASSCODE);
    expect(await a.storage.get(`webda-sealed:pin:${USER}`)).toBe(await fingerprint(server.publicKeys[0].jwk));
    expect(server.devices.map(d => d.name)).toEqual(["Device"]);
    // Every served key retired: no active key to unlock against
    server.publicKeys[0].retiredAt = Date.now();
    await expect(device(server, a.storage).vault.unlock(PASSCODE)).rejects.toThrow("no active public key");
  });

  it("refuses a served keyring that is not the active one or is malformed", async () => {
    const server = new FakeServer();
    const a = device(server);
    await a.vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    const b = device(server);
    await b.vault.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "tablet" });
    const stale = server.keyring!;
    await a.vault.rotate();
    const rotated = server.keyring!;
    // The keyring served with the new active key is still the old one
    server.keyring = stale;
    await expect(device(server, b.storage).vault.unlock(PASSCODE)).rejects.toThrow(/not encrypted for the active/);
    await expect(
      device(server).vault.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "c" })
    ).rejects.toThrow(/not encrypted for the active/);
    // A malformed keyring surfaces its own error
    server.keyring = { ...rotated, v: 99 } as any;
    await expect(device(server, b.storage).vault.unlock(PASSCODE)).rejects.toThrow(/version 99/);
    // The served keyring restored: the refresh succeeds
    server.keyring = rotated;
    await device(server, b.storage).vault.unlock(PASSCODE);
  });

  it("rotate refuses without a device blob or with a substituted key", async () => {
    const server = new FakeServer();
    const a = device(server);
    await a.vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    const blob = (await a.storage.get(`webda-sealed:device:${USER}`))!;
    await a.storage.delete(`webda-sealed:device:${USER}`);
    await expect(a.vault.rotate()).rejects.toBeInstanceOf(DeviceNotEnrolledError);
    await a.storage.set(`webda-sealed:device:${USER}`, blob);
    await substituteKey(server);
    await expect(a.vault.rotate()).rejects.toThrow(/differs from the key pinned/);
  });

  it("reset registers again a device revoked on the server", async () => {
    const server = new FakeServer();
    const a = device(server);
    await a.vault.enroll({ password: PASSWORD, device: PASSCODE, deviceName: "laptop" });
    await server.revokeDevice(server.devices[0].id);
    expect(await a.vault.reset({ password: "new password", device: PASSCODE, deviceName: "laptop" })).toEqual({});
    expect(server.devices.map(d => d.name)).toEqual(["laptop"]);
    expect(JSON.parse((await a.storage.get(`webda-sealed:device:${USER}`))!).deviceId).toBe(server.devices[0].id);
    await device(server, a.storage).vault.unlock(PASSCODE);
  });
});
