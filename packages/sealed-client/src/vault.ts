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
  /** Id returned by `User.Keys.RegisterDevice` */
  deviceId?: string;
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
 * verified the rotation: a keyring opened through an escrow that still holds the pinned private key.
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
   * public key. The device KEK is derived before anything is sent, so a failing KEK leaves nothing on the server.
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
    if (!input.password && !input.recovery) {
      throw new Error("Enrollment needs at least one escrow: a password or a recovery code");
    }
    const pair = await generateUserKeyPair();
    const publicKey = { kid: pair.kid, jwk: pair.publicJwk };
    const keyringKey = await createKeyringKey();
    const device = await this.wrapForDevice(input.device, keyringKey);
    const pkcs8 = b64u.encode(new Uint8Array(await subtle().exportKey("pkcs8", pair.privateKey)));
    const keyring = await encryptKeyring({ keys: { [pair.kid]: pkcs8 }, active: pair.kid }, keyringKey, userId, [
      publicKey
    ]);
    const escrows: Partial<Record<EscrowKind, EscrowBlob>> = {};
    if (input.password) {
      escrows.password = await createEscrowBlob("password", input.password, keyringKey, userId);
    }
    const recoveryCode = input.recovery ? generateRecoveryCode() : undefined;
    if (recoveryCode) {
      escrows.recovery = await createEscrowBlob("recovery", recoveryCode, keyringKey, userId);
    }
    await api.setup(publicKey, keyring, escrows);
    const { id } = await api.registerDevice(input.deviceName);
    await this.writeDevice({ ...device, deviceId: id, keyring });
    await this.options.storage.set(this.pinKey, await fingerprint(pair.publicJwk));
    await this.setUnlocked(keyringKey, keyring, [publicKey]);
    return recoveryCode ? { recoveryCode } : {};
  }

  /**
   * Unlock this device with its KEK; the server is only asked for the public keys, checked against the pin
   * @param device - device KEK
   */
  async unlock(device: DeviceKek): Promise<void> {
    const blob = await this.readDevice();
    if (!blob) {
      throw new DeviceNotEnrolledError();
    }
    const keyringKey = await this.unwrapForDevice(blob, device);
    const { publicKeys } = await this.options.api.getKeys();
    const active = activeKey(publicKeys);
    const served = await fingerprint(active.jwk);
    const pin = await this.options.storage.get(this.pinKey);
    if ((pin !== undefined && pin !== served) || blob.keyring.kid !== active.kid) {
      throw new KeyringPinError(
        "The served active public key differs from the key pinned on this device; if it was rotated on another " +
          "device, unlock with an escrow to verify the rotation"
      );
    }
    await this.setUnlocked(keyringKey, blob.keyring, publicKeys);
    if (pin === undefined) {
      await this.options.storage.set(this.pinKey, served);
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
    // Authenticates the keyring against the served active key and checks every private key against its public key
    const { privateKeys } = await decryptKeyring(keyring, keyringKey, userId, publicKeys);
    const served = await fingerprint(active.jwk);
    const pin = await storage.get(this.pinKey);
    if (pin !== undefined && pin !== served) {
      const held = await Promise.all(Object.values(privateKeys).map(k => fingerprint(k.publicJwk)));
      if (!held.includes(pin)) {
        throw new KeyringPinError("The served keyring does not hold the private key pinned on this device");
      }
    }
    const device = await this.wrapForDevice(register.device, keyringKey);
    const deviceId = (await this.registeredDeviceId()) ?? (await api.registerDevice(register.deviceName)).id;
    await this.writeDevice({ ...device, deviceId, keyring });
    await storage.set(this.pinKey, served);
    this.keyringKey = keyringKey;
    this.privateKeys = privateKeys;
    this.activeKid = active.kid;
  }

  /**
   * Open a sealed value with the private key of its `kid` (retired keys stay readable)
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
   * Re-wrap the keyring key under a new password and replace the password escrow. The unlocked keyring key is used,
   * so the old password is not needed to re-wrap; it is part of the signature for the login password change.
   * @param _oldPassword - current password
   * @param newPassword - new password
   */
  async changePassword(_oldPassword: string, newPassword: string): Promise<void> {
    const keyringKey = this.requireUnlocked();
    const escrow = await createEscrowBlob("password", newPassword, keyringKey, this.options.userId);
    await this.options.api.setEscrow("password", escrow);
  }

  /**
   * Create or replace the recovery code escrow
   * @returns the recovery code, to show once
   */
  async setRecoveryCode(): Promise<string> {
    const keyringKey = this.requireUnlocked();
    const code = generateRecoveryCode();
    await this.options.api.setEscrow(
      "recovery",
      await createEscrowBlob("recovery", code, keyringKey, this.options.userId)
    );
    return code;
  }

  /**
   * Rotate: a new active key pair added to the keyring (same keyring key, the escrows stay valid), the keyring
   * re-encrypted for it, and the pin moved to it. Values sealed to older keys stay readable.
   */
  async rotate(): Promise<void> {
    const { userId, api, storage } = this.options;
    const keyringKey = this.requireUnlocked();
    const blob = await this.readDevice();
    if (!blob) {
      throw new DeviceNotEnrolledError();
    }
    const { publicKeys } = await api.getKeys();
    const active = activeKey(publicKeys);
    if ((await fingerprint(active.jwk)) !== (await storage.get(this.pinKey))) {
      throw new KeyringPinError("The served active public key differs from the key pinned on this device");
    }
    const { keyring } = await decryptKeyring(blob.keyring, keyringKey, userId, publicKeys);
    const pair = await generateUserKeyPair();
    const publicKey = { kid: pair.kid, jwk: pair.publicJwk };
    const pkcs8 = new Uint8Array(await subtle().exportKey("pkcs8", pair.privateKey));
    keyring.keys[pair.kid] = b64u.encode(pkcs8);
    keyring.active = pair.kid;
    const encrypted = await encryptKeyring(keyring, keyringKey, userId, [...publicKeys, publicKey]);
    await api.rotate(publicKey, encrypted);
    await this.writeDevice({ ...blob, keyring: encrypted });
    await storage.set(this.pinKey, await fingerprint(pair.publicJwk));
    this.privateKeys![pair.kid] = {
      privateKey: await subtle().importKey("pkcs8", pkcs8, EC, false, ["deriveBits"]),
      publicJwk: pair.publicJwk
    };
    this.activeKid = pair.kid;
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
