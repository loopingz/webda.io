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
  /** registerDevice calls left to fail */
  registerFailures = 0;

  async getKeys() {
    return structuredClone({ publicKeys: this.publicKeys, devices: this.devices });
  }
  async setup(publicKey: PublicKeyInput, keyring: KeyringBlob, escrows: Partial<Record<string, EscrowBlob>>) {
    this.payloads.push({ publicKey, keyring, escrows });
    if (this.publicKeys.length) throw new Error("409 Keys are already set up");
    if (!Object.keys(escrows).length) throw new Error("400 At least one escrow is required");
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
    this.escrows[kind] = escrow;
  }
  async rotate(
    publicKey: PublicKeyInput,
    keyring: KeyringBlob,
    escrows?: Partial<Record<EscrowBlob["kind"], EscrowBlob>>
  ) {
    this.payloads.push({ publicKey, keyring, escrows });
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
    const d = device(server).vault;
    await d.unlockWithEscrow({ password: "third" }, { device: PASSCODE, deviceName: "d" });
    expect(await d.open(env, CTX)).toBe("still readable");
    // A locked change through a substituted keyring is refused on a pinned device
    await substituteKey(server);
    await expect(
      device(server, b.storage).vault.changePassword("fourth", { oldPassword: "third" })
    ).rejects.toBeInstanceOf(KeyringPinError);
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

    // Another device is refused locally: the rotation was not done by it ...
    await expect(device(server, b.storage).vault.unlock(PASSCODE)).rejects.toBeInstanceOf(KeyringPinError);
    // ... it verifies it through the escrow: the new keyring holds its pinned private key
    const b2 = device(server, b.storage).vault;
    await b2.unlockWithEscrow({ password: PASSWORD }, { device: PASSCODE, deviceName: "tablet" });
    expect(await b2.open(oldEnv, CTX)).toBe("old");
    expect(await b2.open(newEnv, CTX)).toBe("new");
    expect(await b.storage.get(`webda-sealed:pin:${USER}`)).toBe(await fingerprint(server.publicKeys[1].jwk));
    // The device keeps its registration
    expect(server.devices.map(d => d.name)).toEqual(["laptop", "tablet"]);
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
});
