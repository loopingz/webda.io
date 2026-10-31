import {
  ARGON2_DEFAULTS,
  b64u,
  createEscrowBlob,
  createKeyringKey,
  decryptKeyring,
  deriveKek,
  encryptKeyring,
  fieldAad,
  fingerprint,
  generateRecoveryCode,
  generateUserKeyPair,
  KeyringPinError,
  openEscrowBlob,
  openValue,
  sealValue,
  unwrapKeyringKey,
  unwrapKeyringKeyKw,
  wrapKeyringKey,
  wrapKeyringKeyKw,
  type EscrowBlob,
  type KdfName,
  type KeyringBlob,
  type OpenRecipient,
  type PublicKeyEntry,
  type SealedEnvelope
} from "@webda/core/lib/sealed/index.js";
import type { EscrowKind, KeysApi, ServedPublicKey } from "./api.js";
import type { DeviceStorage } from "./storage.js";

/**
 * Key-encryption key of this device: a passcode (Argon2id with a per-device salt) or a platform AES-KW key
 * (WebAuthn PRF, OS keystore)
 */
export type DeviceKek = { kind: "passcode"; passcode: string } | { kind: "platform"; key: CryptoKey };

/** Where a sealed value lives: part of its AAD */
export type SealedContext = { modelType: string; uuid: string; field: string };

/** Secret opening an escrow */
export type EscrowSecret = { password: string } | { recoveryCode: string };

/** Options of {@link KeyVault} */
export interface KeyVaultOptions {
  /** User uuid */
  userId: string;
  /** Server operations */
  api: KeysApi;
  /** Local storage of the device blob and the pin */
  storage: DeviceStorage;
}

/**
 * Local blob of this device, never sent: the keyring key wrapped by the device KEK, and a copy of the encrypted
 * keyring (the server only hands it out with an escrow)
 */
type DeviceBlob = {
  v: 1;
  /** Id returned by `User.Keys.RegisterDevice`, missing until the registration succeeds */
  deviceId?: string;
  /** Name to register this device with */
  deviceName?: string;
  /** KEK kind */
  kek: DeviceKek["kind"];
  /** Passcode KDF */
  kdf?: KdfName;
  kdfParams?: object;
  salt?: string;
  /** AES-KW wrapped key (platform) or AES-GCM IV and ciphertext (passcode) */
  wrapped: string | { iv: string; ct: string };
  /** Encrypted keyring */
  keyring: KeyringBlob;
};

/** The operation needs the vault unlocked */
export class VaultLockedError extends Error {
  /**
   * @param message - error message
   */
  constructor(message = "The key vault is locked") {
    super(message);
    this.name = "VaultLockedError";
  }
}

/** This device holds no keyring for the user, or the device KEK does not open it */
export class DeviceNotEnrolledError extends Error {
  /**
   * @param message - error message
   */
  constructor(message = "This device is not enrolled for this user") {
    super(message);
    this.name = "DeviceNotEnrolledError";
  }
}

/** This device was revoked on the server: its local blob was deleted, add it again with an escrow */
export class DeviceRevokedError extends Error {
  /**
   * @param message - error message
   */
  constructor(message = "This device was revoked: its local keyring was deleted, add it again with an escrow") {
    super(message);
    this.name = "DeviceRevokedError";
  }
}

/** The keyring holds no private key for the `kid` of a sealed value */
export class VaultKeyMissingError extends Error {
  /**
   * @param kid - key id
   */
  constructor(kid: string) {
    super(`No private key for kid ${kid}`);
    this.name = "VaultKeyMissingError";
  }
}

const subtle = () => globalThis.crypto.subtle;
const EC = { name: "ECDH", namedCurve: "P-256" } as const;
const KID_LENGTH = 16;

/** Escrows to create for a new keyring key: at least one */
export type EscrowRequest = { password?: string; recovery?: boolean };

/**
 * Active served key: the newest non-retired one
 * @param publicKeys - served keys, oldest first
 * @returns the active key
 */
function activeKey(publicKeys: ServedPublicKey[]): PublicKeyEntry {
  const active = publicKeys.filter(k => k.retiredAt === undefined).pop();
  if (!active) {
    throw new KeyringPinError("The server serves no active public key");
  }
  return { kid: active.kid, jwk: active.jwk };
}

/**
 * Client side of sealed fields: holds the user keyring on this device and opens sealed values.
 *
 * The keyring (every private key of the user, by kid) is encrypted with a random keyring key; the keyring key is
 * wrapped by the device KEK in the local storage and by the password / recovery code escrows on the server. Private
 * keys live in memory, non-extractable, only while unlocked.
 *
 * Public key pinning: the fingerprint of the active public key is pinned in the storage (`webda-sealed:pin:<userId>`).
 * A served active key with another fingerprint is refused with a `KeyringPinError`, unless this device rotated it, or
 * verified the rotation: a keyring opened with the keyring key (refreshed at unlock, or through an escrow) that still
 * holds the pinned private key. Besides its own rotation, an explicit {@link KeyVault.reset} is the only pin change a
 * device makes by itself; {@link KeyVault.forgetPin} lets the user trust a new key on first use again.
 */
export class KeyVault {
  private keyringKey?: CryptoKey;
  private privateKeys?: Record<string, OpenRecipient>;
  private activeKid?: string;

  /**
   * @param options - user, server operations and local storage
   */
  constructor(protected options: KeyVaultOptions) {}

  /** @returns true while the private keys are in memory */
  get isUnlocked(): boolean {
    return this.keyringKey !== undefined;
  }

  /** @returns storage key of the pinned fingerprint */
  private get pinKey(): string {
    return `webda-sealed:pin:${this.options.userId}`;
  }

  /** @returns storage key of the device blob */
  private get deviceKey(): string {
    return `webda-sealed:device:${this.options.userId}`;
  }

  /**
   * First device: generate the user key pair and keyring, escrow the keyring key, keep it on this device and pin the
   * public key. The device KEK is derived before anything is sent, so a failing KEK leaves nothing on the server; once
   * the server accepted the keys, the device blob and the pin are stored before the device registration, which is
   * retried by the next unlock when it fails.
   * @param input - enrollment
   * @param input.password - password escrow (the login password, its KEK is derived locally with its own salt)
   * @param input.device - device KEK
   * @param input.deviceName - name registered for this device
   * @param input.recovery - also create a recovery code escrow
   * @returns the recovery code, to show once
   */
  async enroll(input: {
    password?: string;
    device: DeviceKek;
    deviceName: string;
    recovery?: boolean;
  }): Promise<{ recoveryCode?: string }> {
    const { userId, api } = this.options;
    const pair = await generateUserKeyPair();
    const publicKey = { kid: pair.kid, jwk: pair.publicJwk };
    const keyringKey = await createKeyringKey();
    const { escrows, recoveryCode } = await this.createEscrows(input, keyringKey);
    const device = await this.wrapForDevice(input.device, keyringKey);
    const pkcs8 = b64u.encode(new Uint8Array(await subtle().exportKey("pkcs8", pair.privateKey)));
    const keyring = await encryptKeyring({ keys: { [pair.kid]: pkcs8 }, active: pair.kid }, keyringKey, userId, [
      publicKey
    ]);
    await api.setup(publicKey, keyring, escrows);
    await this.writeDevice({ ...device, deviceName: input.deviceName, keyring });
    await this.options.storage.set(this.pinKey, await fingerprint(pair.publicJwk));
    await this.setUnlocked(keyringKey, keyring, [publicKey]);
    await this.registerIfMissing();
    return recoveryCode ? { recoveryCode } : {};
  }

  /**
   * Unlock this device with its KEK; the server is only asked for the public keys, checked against the pin, and the
   * devices: a device revoked on the server deletes its local blob ({@link DeviceRevokedError}).
   *
   * A stale local keyring (rotated on another device) is refreshed with `User.Keys.GetKeyring`: the served keyring
   * must open with the keyring key of this device and still hold the pinned private key, otherwise the unlock fails with
   * a `KeyringPinError` (the keyring key was replaced: unlock with an escrow).
   * @param device - device KEK
   */
  async unlock(device: DeviceKek): Promise<void> {
    const { userId, api, storage } = this.options;
    const blob = await this.readDevice();
    if (!blob) {
      throw new DeviceNotEnrolledError();
    }
    const { publicKeys, devices } = await api.getKeys();
    if (blob.deviceId !== undefined && !devices.some(d => d.id === blob.deviceId)) {
      await storage.delete(this.deviceKey);
      throw new DeviceRevokedError();
    }
    const keyringKey = await this.unwrapForDevice(blob, device);
    const active = activeKey(publicKeys);
    const served = await fingerprint(active.jwk);
    const pin = await storage.get(this.pinKey);
    if ((pin === undefined || pin === served) && blob.keyring.kid === active.kid) {
      await this.setUnlocked(keyringKey, blob.keyring, publicKeys);
      if (pin === undefined) {
        await storage.set(this.pinKey, served);
      }
    } else {
      // Rotated on another device: refresh the local keyring
      const fresh = await api.getKeyring();
      const freshActive = activeKey(fresh.publicKeys);
      if (fresh.keyring.kid !== freshActive.kid) {
        throw new KeyringPinError("The keyring is not encrypted for the active public key");
      }
      let privateKeys: Record<string, OpenRecipient>;
      try {
        ({ privateKeys } = await decryptKeyring(fresh.keyring, keyringKey, userId, fresh.publicKeys));
      } catch (err) {
        if (err instanceof KeyringPinError) {
          throw new KeyringPinError(
            "The keyring changed on another device and does not open with the keyring key of this device; if it was " +
              "replaced (rotation with a new keyring key, or a reset), unlock with an escrow"
          );
        }
        throw err;
      }
      const freshServed = await fingerprint(freshActive.jwk);
      await this.assertPinHeld(pin, freshServed, privateKeys);
      await this.writeDevice({ ...blob, keyring: fresh.keyring });
      await storage.set(this.pinKey, freshServed);
      this.keyringKey = keyringKey;
      this.privateKeys = privateKeys;
      this.activeKid = fresh.keyring.kid;
    }
    await this.registerIfMissing();
  }

  /**
   * Accept a served active key other than the pinned one only when the keyring still holds the pinned private key (a
   * rotation by a holder of that key)
   * @param pin - pinned fingerprint, undefined on a device without pin (trust on first use)
   * @param served - fingerprint of the served active key
   * @param privateKeys - private keys of the authenticated keyring
   */
  private async assertPinHeld(
    pin: string | undefined,
    served: string,
    privateKeys: Record<string, OpenRecipient>
  ): Promise<void> {
    if (pin === undefined || pin === served) {
      return;
    }
    const held = await Promise.all(Object.values(privateKeys).map(k => fingerprint(k.publicJwk)));
    if (!held.includes(pin)) {
      throw new KeyringPinError("The served keyring does not hold the private key pinned on this device");
    }
  }

  /**
   * Open the keyring with an escrow and keep it on this device (adds a device, or verifies a rotation done on another
   * device: the new keyring must hold the pinned private key)
   * @param secret - password or recovery code
   * @param register - device KEK and name
   * @param register.device - device KEK
   * @param register.deviceName - name registered for this device
   */
  async unlockWithEscrow(secret: EscrowSecret, register: { device: DeviceKek; deviceName: string }): Promise<void> {
    const { api, storage } = this.options;
    const { keyringKey, keyring, privateKeys, served } = await this.openEscrow(secret);
    const device = await this.wrapForDevice(register.device, keyringKey);
    const deviceId = (await this.registeredDeviceId()) ?? (await api.registerDevice(register.deviceName)).id;
    await this.writeDevice({ ...device, deviceId, deviceName: register.deviceName, keyring });
    await storage.set(this.pinKey, served);
    this.keyringKey = keyringKey;
    this.privateKeys = privateKeys;
    this.activeKid = keyring.kid;
  }

  /**
   * Fetch an escrow and open the served keyring with it. The keyring is authenticated against the served active key
   * and every private key against its public key; a served key other than the pinned one is only accepted when the
   * keyring still holds the pinned private key (a rotation by a holder of that key)
   * @param secret - password or recovery code
   * @returns the keyring key, the encrypted keyring, its private keys and the active fingerprint
   */
  private async openEscrow(secret: EscrowSecret): Promise<{
    keyringKey: CryptoKey;
    keyring: KeyringBlob;
    privateKeys: Record<string, OpenRecipient>;
    served: string;
  }> {
    const { userId, api, storage } = this.options;
    const kind: EscrowKind = "password" in secret ? "password" : "recovery";
    const { escrow, keyring, publicKeys } = await api.getEscrow(kind);
    const keyringKey = await openEscrowBlob(
      escrow,
      "password" in secret ? secret.password : secret.recoveryCode,
      userId
    );
    const active = activeKey(publicKeys);
    if (keyring.kid !== active.kid) {
      throw new KeyringPinError("The keyring is not encrypted for the active public key");
    }
    const { privateKeys } = await decryptKeyring(keyring, keyringKey, userId, publicKeys);
    const served = await fingerprint(active.jwk);
    await this.assertPinHeld(await storage.get(this.pinKey), served, privateKeys);
    return { keyringKey, keyring, privateKeys, served };
  }

  /**
   * Open a sealed value with the private key of its `kid` (retired keys stay readable). The private keys all come
   * from a keyring authenticated against the pinned active key (or a verified rotation of it), each checked against
   * its served public key
   * @param env - sealed envelope
   * @param ctx - model type, uuid and field it is stored in (AAD)
   * @returns the value
   */
  async open<T = unknown>(env: SealedEnvelope, ctx: SealedContext): Promise<T> {
    this.requireUnlocked();
    const recipient = this.privateKeys![env.kid];
    if (!recipient) {
      throw new VaultKeyMissingError(env.kid);
    }
    return openValue<T>(env, recipient, fieldAad(ctx.modelType, ctx.uuid, ctx.field, env.kid));
  }

  /**
   * Seal a value to the user pinned public key (works while locked)
   * @param value - JSON-encodable value
   * @param ctx - model type, uuid and field it will be stored in (AAD)
   * @param recipient - public key to seal to, refused unless it is the pinned key (default: the active key)
   * @returns the envelope
   */
  async seal(value: unknown, ctx: SealedContext, recipient?: PublicKeyEntry): Promise<SealedEnvelope> {
    const target =
      recipient ??
      (this.isUnlocked
        ? { kid: this.activeKid!, jwk: this.privateKeys![this.activeKid!].publicJwk }
        : activeKey((await this.options.api.getKeys()).publicKeys));
    const pin = await this.options.storage.get(this.pinKey);
    const fp = await fingerprint(target.jwk);
    if (pin === undefined || fp !== pin || target.kid !== fp.substring(0, KID_LENGTH)) {
      throw new KeyringPinError("Refusing to seal to a public key that is not pinned on this device");
    }
    return sealValue(value, target, fieldAad(ctx.modelType, ctx.uuid, ctx.field, target.kid));
  }

  /**
   * Build the password escrow of a new password without sending it: the keyring key is re-wrapped under the new
   * password, directly while unlocked, otherwise through the password escrow opened with the old password (a
   * throttled `getEscrow`, checked against the pin).
   *
   * For a host whose login password change takes the escrow with it (`Auth.Password.Change` of `@webda/auth` refuses
   * a change without it once a password escrow exists): send the blob as its `escrow` input, both are then stored
   * together. {@link KeyVault.changePassword} sends it alone with `User.Keys.SetEscrow`.
   *
   * While unlocked, the escrow is refused with a `KeyringPinError` when the keyring changed on another device since
   * the unlock (its keyring key may have been replaced): unlock again first.
   * @param newPassword - new password
   * @param opts - options
   * @param opts.oldPassword - current password, needed while locked
   * @returns the escrow of the keyring key under the new password
   */
  async createPasswordEscrow(newPassword: string, opts: { oldPassword?: string } = {}): Promise<EscrowBlob> {
    let keyringKey = this.keyringKey;
    if (keyringKey) {
      await this.assertKeyringCurrent();
    } else {
      if (opts.oldPassword === undefined) {
        throw new VaultLockedError("Unlock the vault or give the old password to change the password escrow");
      }
      keyringKey = (await this.openEscrow({ password: opts.oldPassword })).keyringKey;
    }
    return createEscrowBlob("password", newPassword, keyringKey, this.options.userId);
  }

  /**
   * Re-wrap the keyring key under a new password and replace the password escrow with `User.Keys.SetEscrow`
   * (see {@link KeyVault.createPasswordEscrow} for the unlock rules).
   *
   * The password escrow must follow the login password: a host whose password change does not take the escrow
   * changes both together (this call right after, or before, the login password change), otherwise the next device
   * has to be added with the old password.
   * @param newPassword - new password
   * @param opts - options
   * @param opts.oldPassword - current password, needed while locked
   */
  async changePassword(newPassword: string, opts: { oldPassword?: string } = {}): Promise<void> {
    await this.options.api.setEscrow("password", await this.createPasswordEscrow(newPassword, opts));
  }

  /**
   * Create or replace the recovery code escrow; refused with a `KeyringPinError` when the keyring changed on another
   * device since the unlock (unlock again first)
   * @returns the recovery code, to show once
   */
  async setRecoveryCode(): Promise<string> {
    const keyringKey = this.requireUnlocked();
    await this.assertKeyringCurrent();
    const code = generateRecoveryCode();
    await this.options.api.setEscrow(
      "recovery",
      await createEscrowBlob("recovery", code, keyringKey, this.options.userId)
    );
    return code;
  }

  /**
   * Remove the recovery code escrow (`User.Keys.RemoveEscrow`). The server refuses to remove the last escrow while no
   * device is registered (409, surfaced as the api error)
   */
  async removeRecoveryCode(): Promise<void> {
    await this.options.api.removeEscrow("recovery");
  }

  /**
   * Keys lost (no device left, password and recovery code forgotten): start over with a new key pair and a new keyring
   * key, through `User.Keys.Rotate` (fresh authentication required, the vault does not need to be unlocked).
   *
   * The new keyring holds the new private key only: values sealed to the older keys stay unreadable, new values open.
   * The requested escrows replace the old ones, this device keeps the new keyring key and is registered (kept when
   * already registered), and the pin moves to the new key: an explicit reset by the user is, with its own rotation, the
   * only pin change a device makes by itself. The other devices are cut off (their unlock fails with a
   * `KeyringPinError`); they are added again with the new escrow after {@link KeyVault.forgetPin}.
   * @param input - reset
   * @param input.password - password escrow
   * @param input.recovery - also create a recovery code escrow
   * @param input.device - device KEK
   * @param input.deviceName - name registered for this device
   * @returns the recovery code when one was requested, to show once
   */
  async reset(input: EscrowRequest & { device: DeviceKek; deviceName: string }): Promise<{ recoveryCode?: string }> {
    const { userId, api, storage } = this.options;
    const pair = await generateUserKeyPair();
    const publicKey = { kid: pair.kid, jwk: pair.publicJwk };
    const keyringKey = await createKeyringKey();
    const { escrows, recoveryCode } = await this.createEscrows(input, keyringKey);
    const device = await this.wrapForDevice(input.device, keyringKey);
    const pkcs8 = b64u.encode(new Uint8Array(await subtle().exportKey("pkcs8", pair.privateKey)));
    const keyring = await encryptKeyring({ keys: { [pair.kid]: pkcs8 }, active: pair.kid }, keyringKey, userId, [
      publicKey
    ]);
    const deviceId = await this.registeredDeviceId();
    await api.rotate(publicKey, keyring, escrows);
    await this.writeDevice({ ...device, deviceId, deviceName: input.deviceName, keyring });
    await storage.set(this.pinKey, await fingerprint(pair.publicJwk));
    await this.setUnlocked(keyringKey, keyring, [publicKey]);
    await this.registerIfMissing();
    return recoveryCode ? { recoveryCode } : {};
  }

  /**
   * Forget the public key pinned on this device and lock: the next {@link KeyVault.unlockWithEscrow} trusts the served
   * key on first use, as on a new device. For the user to call explicitly after a {@link KeyVault.reset} done on
   * another device, ideally once the new fingerprint was compared out of band
   */
  async forgetPin(): Promise<void> {
    this.lock();
    await this.options.storage.delete(this.pinKey);
  }

  /**
   * Rotate: a new active key pair added to the keyring, the keyring re-encrypted for it, and the pin moved to it.
   * Values sealed to older keys stay readable.
   *
   * By default the keyring key is kept, so the escrows stay valid: a device that kept its blob (lost or revoked) can
   * still open the keyring. With `newKeyringKey`, a fresh keyring key encrypts the keyring, the requested escrows are
   * rebuilt and replace the old ones, and this device re-wraps its blob with its KEK: the answer to a lost or revoked
   * device.
   * @param options - rotation options
   * @param options.newKeyringKey - replace the keyring key: the device KEK of this device and the escrows to create
   * @returns the new recovery code when one was requested, to show once
   */
  async rotate(
    options: { newKeyringKey?: EscrowRequest & { device: DeviceKek } } = {}
  ): Promise<{ recoveryCode?: string }> {
    const { userId, api, storage } = this.options;
    const currentKey = this.requireUnlocked();
    const blob = await this.readDevice();
    if (!blob) {
      throw new DeviceNotEnrolledError();
    }
    const { publicKeys } = await api.getKeys();
    const active = activeKey(publicKeys);
    if ((await fingerprint(active.jwk)) !== (await storage.get(this.pinKey))) {
      throw new KeyringPinError("The served active public key differs from the key pinned on this device");
    }
    const { keyring } = await decryptKeyring(blob.keyring, currentKey, userId, publicKeys);
    const replace = options.newKeyringKey;
    const keyringKey = replace ? await createKeyringKey() : currentKey;
    const { escrows, recoveryCode } = replace
      ? await this.createEscrows(replace, keyringKey)
      : { escrows: undefined, recoveryCode: undefined };
    const device = replace ? await this.wrapForDevice(replace.device, keyringKey) : undefined;
    const pair = await generateUserKeyPair();
    const publicKey = { kid: pair.kid, jwk: pair.publicJwk };
    const pkcs8 = new Uint8Array(await subtle().exportKey("pkcs8", pair.privateKey));
    keyring.keys[pair.kid] = b64u.encode(pkcs8);
    keyring.active = pair.kid;
    const encrypted = await encryptKeyring(keyring, keyringKey, userId, [...publicKeys, publicKey]);
    await api.rotate(publicKey, encrypted, escrows);
    await this.writeDevice(
      device
        ? { ...device, deviceId: blob.deviceId, deviceName: blob.deviceName, keyring: encrypted }
        : { ...blob, keyring: encrypted }
    );
    await storage.set(this.pinKey, await fingerprint(pair.publicJwk));
    this.keyringKey = keyringKey;
    this.privateKeys![pair.kid] = {
      privateKey: await subtle().importKey("pkcs8", pkcs8, EC, false, ["deriveBits"]),
      publicJwk: pair.publicJwk
    };
    this.activeKid = pair.kid;
    return recoveryCode ? { recoveryCode } : {};
  }

  /**
   * Escrows of a keyring key
   * @param request - password and/or recovery code
   * @param keyringKey - key to escrow
   * @returns the escrows by kind and the recovery code
   */
  private async createEscrows(
    request: EscrowRequest,
    keyringKey: CryptoKey
  ): Promise<{ escrows: Partial<Record<EscrowKind, EscrowBlob>>; recoveryCode?: string }> {
    const { userId } = this.options;
    if (!request.password && !request.recovery) {
      throw new Error("At least one escrow is needed: a password or a recovery code");
    }
    const escrows: Partial<Record<EscrowKind, EscrowBlob>> = {};
    if (request.password) {
      escrows.password = await createEscrowBlob("password", request.password, keyringKey, userId);
    }
    const recoveryCode = request.recovery ? generateRecoveryCode() : undefined;
    if (recoveryCode) {
      escrows.recovery = await createEscrowBlob("recovery", recoveryCode, keyringKey, userId);
    }
    return { escrows, recoveryCode };
  }

  /**
   * Refuse a write made with the in-memory keyring key when the keyring changed on another device since the unlock: the
   * served active key must still be the unlocked one and the pinned one
   */
  private async assertKeyringCurrent(): Promise<void> {
    const active = activeKey((await this.options.api.getKeys()).publicKeys);
    const pin = await this.options.storage.get(this.pinKey);
    if (active.kid !== this.activeKid || (await fingerprint(active.jwk)) !== pin) {
      throw new KeyringPinError("The keyring changed on another device; unlock again");
    }
  }

  /**
   * Register this device when an earlier registration failed (enrollment); a failure is retried at the next unlock
   */
  private async registerIfMissing(): Promise<void> {
    const blob = await this.readDevice();
    if (!blob || blob.deviceId !== undefined) {
      return;
    }
    try {
      const { id } = await this.options.api.registerDevice(blob.deviceName ?? "Device");
      await this.writeDevice({ ...blob, deviceId: id });
    } catch {
      // Not registered yet (e.g. the session is no longer fresh): retried at the next unlock
    }
  }

  /** Drop the keys from memory */
  lock(): void {
    this.keyringKey = undefined;
    this.privateKeys = undefined;
    this.activeKid = undefined;
  }

  /**
   * @returns the keyring key
   */
  private requireUnlocked(): CryptoKey {
    if (!this.keyringKey) {
      throw new VaultLockedError();
    }
    return this.keyringKey;
  }

  /**
   * Decrypt the keyring and keep its private keys in memory
   * @param keyringKey - keyring key
   * @param keyring - encrypted keyring
   * @param publicKeys - served public keys
   */
  private async setUnlocked(keyringKey: CryptoKey, keyring: KeyringBlob, publicKeys: PublicKeyEntry[]): Promise<void> {
    const { privateKeys } = await decryptKeyring(keyring, keyringKey, this.options.userId, publicKeys);
    this.keyringKey = keyringKey;
    this.privateKeys = privateKeys;
    this.activeKid = keyring.kid;
  }

  /**
   * Wrap the keyring key under the device KEK
   * @param device - device KEK
   * @param keyringKey - keyring key
   * @returns the device blob without keyring
   */
  private async wrapForDevice(device: DeviceKek, keyringKey: CryptoKey): Promise<Omit<DeviceBlob, "keyring">> {
    if (device.kind === "platform") {
      return { v: 1, kek: "platform", wrapped: await wrapKeyringKeyKw(keyringKey, device.key) };
    }
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const kdfParams = { ...ARGON2_DEFAULTS };
    const kek = await deriveKek(device.passcode, salt, "argon2id", kdfParams);
    return {
      v: 1,
      kek: "passcode",
      kdf: "argon2id",
      kdfParams,
      salt: b64u.encode(salt),
      wrapped: await wrapKeyringKey(keyringKey, kek, this.deviceAad())
    };
  }

  /**
   * Unwrap the keyring key with the device KEK
   * @param blob - device blob
   * @param device - device KEK
   * @returns the keyring key
   */
  private async unwrapForDevice(blob: DeviceBlob, device: DeviceKek): Promise<CryptoKey> {
    if (blob.kek !== device.kind) {
      throw new DeviceNotEnrolledError(`This device is enrolled with a ${blob.kek} KEK`);
    }
    try {
      if (device.kind === "platform") {
        return await unwrapKeyringKeyKw(blob.wrapped as string, device.key);
      }
      const kek = await deriveKek(device.passcode, b64u.decode(blob.salt!), blob.kdf!, blob.kdfParams!);
      return await unwrapKeyringKey(blob.wrapped as { iv: string; ct: string }, kek, this.deviceAad());
    } catch {
      throw new DeviceNotEnrolledError("The device passcode or platform key does not open this device keyring");
    }
  }

  /**
   * @returns AAD of the passcode wrap of the keyring key
   */
  private deviceAad(): string {
    return `webda-device|${this.options.userId}`;
  }

  /**
   * @returns the id of this device when it is still registered on the server
   */
  private async registeredDeviceId(): Promise<string | undefined> {
    const id = (await this.readDevice())?.deviceId;
    if (id === undefined) {
      return undefined;
    }
    const { devices } = await this.options.api.getKeys();
    return devices.some(d => d.id === id) ? id : undefined;
  }

  /**
   * @returns the device blob of the user, undefined when this device is not enrolled
   */
  private async readDevice(): Promise<DeviceBlob | undefined> {
    const raw = await this.options.storage.get(this.deviceKey);
    return raw === undefined ? undefined : JSON.parse(raw);
  }

  /**
   * @param blob - device blob
   */
  private async writeDevice(blob: DeviceBlob): Promise<void> {
    await this.options.storage.set(this.deviceKey, JSON.stringify(blob));
  }
}
