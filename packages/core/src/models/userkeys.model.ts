import { randomUUID } from "node:crypto";
import { Parameters } from "../application/parameters.js";
import { useBehaviorParameters } from "../application/modelconfiguration.js";
import { runAsSystem, useContext } from "../contexts/execution.js";
import * as WebdaError from "../errors/errors.js";
import { Throttled } from "../errors/mfa.js";
import { SealedFormatError } from "../errors/sealed.js";
import { b64u, fingerprint, type EscrowBlob, type KeyringBlob, type PublicKeyEntry } from "../sealed/index.js";
import type { JsonWebKey } from "../sealed/encoding.js";
import { countAttempt } from "../utils/throttle.js";
import { Action } from "./decorator.js";

/** Escrow kinds: the keyring key wrapped by a KEK derived from the password or from a recovery code */
export type EscrowKind = EscrowBlob["kind"];

/** Escrow kinds accepted by the server */
const ESCROW_KINDS: readonly EscrowKind[] = ["password", "recovery"];

/** Password KDFs accepted in an escrow blob */
const KDFS: readonly EscrowBlob["kdf"][] = ["argon2id", "pbkdf2-sha256"];

/** Length of a `kid`: the first characters of the public key fingerprint */
const KID_LENGTH = 16;

/** Upper bound of the encrypted keyring (base64url characters), far above any real keyring */
const MAX_KEYRING_LENGTH = 65536;

/** Upper bound of a device name */
const MAX_DEVICE_NAME = 128;

/** Upper bound of the registered devices */
export const MAX_DEVICES = 32;

/**
 * Accepted KDF parameters: the server floors (Argon2id m=64 MiB t=3 p=1, PBKDF2 600 000) up to the client maxima of
 * `deriveKek`, so a weak escrow (cheap offline brute force) is never stored
 */
const KDF_PARAMS: Record<EscrowBlob["kdf"], Record<string, [number, number]>> = {
  argon2id: { m: [65536, 262144], t: [3, 10], p: [1, 4] },
  "pbkdf2-sha256": { iterations: [600000, 2000000] }
};

/** A user public key, the recipient of the values sealed while it is active */
export interface UserPublicKey {
  /** Key id: the first 16 characters of the key fingerprint */
  kid: string;
  /** Seal algorithm */
  alg: "ECDH-ES+A256GCM";
  /** P-256 public JWK */
  jwk: JsonWebKey;
  /** Creation, ms since epoch */
  createdAt: number;
  /** Retirement (replaced by a rotation), ms since epoch: no new value is sealed to a retired key */
  retiredAt?: number;
}

/** A device holding the keyring locally: metadata only, the device blob never reaches the server */
export interface UserDevice {
  /** Device id */
  id: string;
  /** Name chosen by the user */
  name: string;
  /** Registration, ms since epoch */
  createdAt: number;
  /** Last use, ms since epoch */
  lastSeenAt?: number;
}

/** Public key submitted by a client: kid and public JWK */
export interface UserPublicKeyInput {
  /** Key id: the first 16 characters of the key fingerprint */
  kid: string;
  /** P-256 public JWK, without private part */
  jwk: JsonWebKey;
}

/** Escrow blobs by kind */
export type Escrows = Partial<Record<EscrowKind, EscrowBlob>>;

/** Policy of a UserKeys attribute */
export class UserKeysParameters extends Parameters {
  /** Escrow fetches allowed before the lockout. @minimum 1 */
  escrowAttempts: number = 5;
  /** Escrow lockout duration, ms: the counter decays once it is over. @minimum 0 */
  escrowLockout: number = 900000;
  /** Maximum authentication age (session `authAt`) for every key action, seconds; 0 disables it. @minimum 0 */
  reauthMaxAge: number = 300;
}

/**
 * Check a base64url field and its decoded length
 * @param value - field value
 * @param what - field name, for the error
 * @param length - exact decoded length, or [min, max] when an array
 */
function assertB64u(value: unknown, what: string, length?: number | [number, number]): void {
  let bytes: Uint8Array;
  try {
    bytes = b64u.decode(value as string);
  } catch {
    throw new SealedFormatError(`Invalid ${what}: not a base64url string`);
  }
  const [min, max] = Array.isArray(length) ? length : [length ?? 1, length ?? Infinity];
  if (bytes.length < min || bytes.length > max) {
    throw new SealedFormatError(`Invalid ${what}: unexpected length`);
  }
}

/**
 * @param value - value
 * @returns true for a plain object
 */
function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Check a client public key: a P-256 public JWK (no private part) whose kid is derived from its fingerprint
 * @param publicKey - submitted key
 * @returns the normalised public JWK
 */
async function checkPublicKey(publicKey: UserPublicKeyInput): Promise<JsonWebKey> {
  if (!isObject(publicKey) || typeof publicKey.kid !== "string" || !isObject(publicKey.jwk)) {
    throw new SealedFormatError("Invalid public key");
  }
  const { jwk } = publicKey;
  if ("d" in jwk) {
    throw new SealedFormatError("A private key must never be sent to the server");
  }
  if (jwk.kty !== "EC" || jwk.crv !== "P-256") {
    throw new SealedFormatError("Public key must be an EC P-256 JWK");
  }
  assertB64u(jwk.x, "public key x", 32);
  assertB64u(jwk.y, "public key y", 32);
  let fp: string;
  try {
    // Imports the key: refuses a point that is not on the curve
    fp = await fingerprint(jwk);
  } catch {
    throw new SealedFormatError("Invalid P-256 public key");
  }
  if (publicKey.kid !== fp.substring(0, KID_LENGTH)) {
    throw new SealedFormatError("Public key kid does not match its fingerprint");
  }
  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
}

/**
 * Check an encrypted keyring blob, encrypted for the active key `kid`
 * @param keyring - submitted blob
 * @param kid - active key id
 * @returns the normalised blob
 */
function checkKeyring(keyring: KeyringBlob, kid: string): KeyringBlob {
  if (!isObject(keyring) || keyring.v !== 1) {
    throw new SealedFormatError("Invalid keyring: v must be 1");
  }
  if (keyring.kid !== kid) {
    throw new SealedFormatError("Keyring must be encrypted for the active public key");
  }
  assertB64u(keyring.iv, "keyring iv", 12);
  if (typeof keyring.ct === "string" && keyring.ct.length > MAX_KEYRING_LENGTH) {
    throw new SealedFormatError("Invalid keyring ciphertext: too large");
  }
  // GCM tag (16 bytes) plus a JSON keyring
  assertB64u(keyring.ct, "keyring ciphertext", [17, Infinity]);
  return { v: 1, kid: keyring.kid, iv: keyring.iv, ct: keyring.ct };
}

/**
 * Check an escrow kind
 * @param kind - submitted kind
 * @returns the kind
 */
function checkKind(kind: unknown): EscrowKind {
  if (!ESCROW_KINDS.includes(kind as EscrowKind)) {
    throw new SealedFormatError(`Unknown escrow kind ${String(kind)}`);
  }
  return kind as EscrowKind;
}

/**
 * Check an escrow blob stored in the `kind` slot
 * @param kind - slot
 * @param escrow - submitted blob
 * @returns the normalised blob
 */
function checkEscrow(kind: EscrowKind, escrow: EscrowBlob): EscrowBlob {
  if (!isObject(escrow) || escrow.v !== 1) {
    throw new SealedFormatError("Invalid escrow: v must be 1");
  }
  if (escrow.kind !== kind) {
    throw new SealedFormatError(`Escrow kind ${String(escrow.kind)} stored as ${kind}`);
  }
  if (!KDFS.includes(escrow.kdf)) {
    throw new SealedFormatError(`Unsupported kdf ${String(escrow.kdf)}`);
  }
  const bounds = KDF_PARAMS[escrow.kdf];
  const params = escrow.kdfParams as Record<string, number>;
  if (
    !isObject(params) ||
    Object.keys(params).length !== Object.keys(bounds).length ||
    !Object.entries(bounds).every(
      ([name, [min, max]]) => Number.isInteger(params[name]) && params[name] >= min && params[name] <= max
    )
  ) {
    const expected = Object.entries(bounds)
      .map(([name, [min, max]]) => `${name} ${min}..${max}`)
      .join(", ");
    throw new SealedFormatError(`Invalid ${escrow.kdf} kdfParams (${expected})`);
  }
  assertB64u(escrow.salt, "escrow salt", 16);
  assertB64u(escrow.iv, "escrow iv", 12);
  // Wrapped 32-byte keyring key and its GCM tag
  assertB64u(escrow.ct, "escrow ciphertext", 48);
  const { v, kdf, kdfParams, salt, iv, ct } = escrow;
  return { v, kind, kdf, kdfParams: { ...kdfParams }, salt, iv, ct };
}

/**
 * Check a set of escrows: at least one, each in its own kind slot
 * @param escrows - submitted escrows
 * @returns the normalised escrows
 */
function checkEscrows(escrows: Escrows): Escrows {
  if (!isObject(escrows) || Object.keys(escrows).length === 0) {
    throw new SealedFormatError("At least one escrow is required");
  }
  const result: Escrows = {};
  for (const [kind, escrow] of Object.entries(escrows)) {
    result[checkKind(kind)] = checkEscrow(kind as EscrowKind, escrow);
  }
  return result;
}

/**
 * End-to-end encryption keys of a user (`User.keys`): public keys in clear, the encrypted keyring holding every
 * private key and its escrows, and the devices holding the keyring
 *
 * The private keys never reach the server in clear: the keyring (PKCS#8 keys by kid) is encrypted on the client with a
 * random keyring key, itself wrapped by KEKs the server never sees (escrows: Argon2id/PBKDF2 of the password or of a
 * recovery code; devices: WebAuthn PRF, OS keystore or passcode, kept locally). See `src/sealed/` for the formats.
 *
 * Actions, exposed as `User.Keys.<Action>`, are authorised by the owner `canAct(context, "keys.<action>")` (the user
 * only, for `User`). `__keyring` and `__escrows` are server-only: `getEscrow` is the only way out, to the owner,
 * throttled on the owner attempts `_escrowAttempts`/`_lastEscrowAttemptAt` and audited by the operation events
 * (`Webda.OperationSuccess`/`Webda.OperationFailure`). Opening an escrow happens on the client, so a fetch cannot be
 * known to have succeeded: every fetch counts and nothing resets the counter, the lockout decays after
 * `escrowLockout`.
 *
 * Every action requires a recent authentication (session `authAt` younger than `reauthMaxAge`) and, when the user has
 * MFA enabled, a verified MFA login (session `mfa: "verified"`).
 *
 * Only the `keys` attribute is written (a patch): a whole-document save would overwrite the attempts counter
 * incremented concurrently by `getEscrow`.
 * @WebdaBehavior Webda/UserKeys
 */
export class UserKeys {
  static Parameters = UserKeysParameters;

  /** Public keys, oldest first: the newest non-retired one is active */
  publicKeys: UserPublicKey[] = [];

  /** Encrypted keyring, server-only */
  __keyring?: KeyringBlob;

  /** Escrows of the keyring key by kind, server-only */
  __escrows?: Escrows;

  /** Devices holding the keyring (metadata only) */
  devices: UserDevice[] = [];

  /**
   * @param data - initial or stored data
   */
  constructor(data?: any) {
    if (data) {
      Object.assign(this, data);
    }
    this.publicKeys ??= [];
    this.devices ??= [];
  }

  /**
   * Active public key, the recipient of new sealed values
   * @returns the newest non-retired key, undefined before setup
   */
  getActivePublicKey(): PublicKeyEntry | undefined {
    const active = this.publicKeys.filter(k => k.retiredAt === undefined).pop();
    return active ? { kid: active.kid, jwk: active.jwk } : undefined;
  }

  /**
   * @returns true once the keys are set up
   */
  isSetup(): boolean {
    return this.publicKeys.length > 0;
  }

  /**
   * Resolve the policy of this attribute; a detached behavior uses defaults
   * @returns the parameters
   */
  getParameters(): UserKeysParameters {
    const owner = this.getOwner();
    return owner
      ? useBehaviorParameters(owner.constructor, (this as any).parent.attribute, this.constructor as typeof UserKeys)
      : new UserKeysParameters();
  }

  /**
   * Owning model (set by behavior hydration)
   * @returns the owner or undefined when detached
   */
  protected getOwner(): any {
    return (this as any).parent?.instance;
  }

  /**
   * @returns the owner, refusing a detached behavior
   */
  private requireOwner(): any {
    const owner = this.getOwner();
    if (!owner) {
      throw new WebdaError.BadRequest("UserKeys is not attached to a model");
    }
    return owner;
  }

  /**
   * Refuse an action needing the keys before setup (412)
   */
  private requireSetup(): void {
    if (!this.isSetup()) {
      throw new WebdaError.PreconditionFailed("Keys are not set up");
    }
  }

  /**
   * Write the `keys` attribute only (the action was authorised by {@link UserKeys.authorize})
   */
  private async saveOwner(): Promise<void> {
    const owner = this.requireOwner();
    const { publicKeys, __keyring, __escrows, devices } = this;
    await runAsSystem(() => owner.ref().patch({ keys: { publicKeys, __keyring, __escrows, devices } }));
  }

  /**
   * Refuse an action without a recent authentication, or without a verified MFA login when the user has MFA enabled
   * (401). The operation layer already checked the owner `canAct("keys.<action>")`
   * @returns the owner
   */
  private authorize(): any {
    const owner = this.requireOwner();
    const session = useContext().getSession();
    const { reauthMaxAge } = this.getParameters();
    if (reauthMaxAge && (!session?.authAt || Date.now() - session.authAt > reauthMaxAge * 1000)) {
      throw new WebdaError.Unauthorized("Reauthentication required");
    }
    if (owner.mfa?.isEnabled?.() && session.mfa !== "verified") {
      throw new WebdaError.Unauthorized("Verified MFA login required");
    }
    return owner;
  }

  /**
   * First enrollment: the first public key, its keyring and at least one escrow (409 when already set up)
   * @param publicKey - public key `{ kid, jwk }`
   * @param keyring - keyring encrypted for this key
   * @param escrows - escrows of the keyring key by kind
   */
  @Action({ rest: { method: "POST" } })
  async setup(publicKey: UserPublicKeyInput, keyring: KeyringBlob, escrows: Escrows): Promise<void> {
    this.authorize();
    if (this.isSetup()) {
      throw new WebdaError.Conflict("Keys are already set up");
    }
    const jwk = await checkPublicKey(publicKey);
    this.__keyring = checkKeyring(keyring, publicKey.kid);
    this.__escrows = checkEscrows(escrows);
    this.publicKeys = [{ kid: publicKey.kid, alg: "ECDH-ES+A256GCM", jwk, createdAt: Date.now() }];
    await this.saveOwner();
  }

  /**
   * Fetch an escrow to open the keyring on a new device. Throttled: every fetch counts until a device registers
   * @param kind - escrow kind
   * @returns the escrow, the encrypted keyring and the public keys to check it against
   */
  @Action({ rest: { method: "POST" } })
  async getEscrow(
    kind: EscrowKind
  ): Promise<{ escrow: EscrowBlob; keyring: KeyringBlob; publicKeys: UserPublicKey[] }> {
    const owner = this.authorize();
    checkKind(kind);
    // An undeclared counter is not loaded with the owner: its attempts would never lock
    if (typeof owner._escrowAttempts !== "number") {
      throw new WebdaError.CodeError(
        "USERKEYS_THROTTLE_UNDECLARED",
        "A model holding UserKeys must declare _escrowAttempts: number = 0 and _lastEscrowAttemptAt?: number"
      );
    }
    const { escrowAttempts, escrowLockout } = this.getParameters();
    const throttle = { failedBeforeDelay: escrowAttempts, lockout: escrowLockout };
    if (await countAttempt(owner.ref(), "_escrowAttempts", "_lastEscrowAttemptAt", throttle, owner)) {
      throw new Throttled();
    }
    const escrow = this.__escrows?.[kind];
    if (!escrow || !this.__keyring) {
      throw new WebdaError.NotFound(`No ${kind} escrow`);
    }
    return { escrow, keyring: this.__keyring, publicKeys: this.publicKeys };
  }

  /**
   * Create or replace an escrow, from a device holding the keyring key
   * @param kind - escrow kind
   * @param escrow - escrow blob of this kind
   */
  @Action({ rest: { method: "PUT" } })
  async setEscrow(kind: EscrowKind, escrow: EscrowBlob): Promise<void> {
    this.authorize();
    this.requireSetup();
    this.__escrows = { ...this.__escrows, [checkKind(kind)]: checkEscrow(kind, escrow) };
    await this.saveOwner();
  }

  /**
   * Remove an escrow; the last one cannot be removed while no device holds the keyring (409)
   * @param kind - escrow kind
   */
  @Action({ rest: { method: "DELETE" } })
  async removeEscrow(kind: EscrowKind): Promise<void> {
    this.authorize();
    checkKind(kind);
    if (!this.__escrows?.[kind]) {
      throw new WebdaError.NotFound(`No ${kind} escrow`);
    }
    if (Object.keys(this.__escrows).length === 1 && this.devices.length === 0) {
      throw new WebdaError.Conflict("The last escrow cannot be removed while no device is registered");
    }
    const { [kind]: _removed, ...others } = this.__escrows;
    this.__escrows = others;
    await this.saveOwner();
  }

  /**
   * Add a new active public key and retire the previous one; the keyring is re-encrypted for it. The escrows are
   * replaced when given (new keyring key), kept otherwise
   * @param publicKey - new public key `{ kid, jwk }`
   * @param keyring - keyring holding every private key, encrypted for the new key
   * @param escrows - escrows of a new keyring key
   */
  @Action({ rest: { method: "POST" } })
  async rotate(publicKey: UserPublicKeyInput, keyring: KeyringBlob, escrows?: Escrows): Promise<void> {
    this.authorize();
    this.requireSetup();
    const jwk = await checkPublicKey(publicKey);
    if (this.publicKeys.some(k => k.kid === publicKey.kid)) {
      throw new WebdaError.Conflict("This public key was already used");
    }
    const newKeyring = checkKeyring(keyring, publicKey.kid);
    const newEscrows = escrows === undefined ? this.__escrows : checkEscrows(escrows);
    const now = Date.now();
    for (const key of this.publicKeys) {
      key.retiredAt ??= now;
    }
    this.publicKeys.push({ kid: publicKey.kid, alg: "ECDH-ES+A256GCM", jwk, createdAt: now });
    this.__keyring = newKeyring;
    this.__escrows = newEscrows;
    await this.saveOwner();
  }

  /**
   * Register a device that opened the keyring (at most {@link MAX_DEVICES}, 409 beyond)
   * @param name - device name
   * @returns the device id
   */
  @Action({ rest: { method: "POST" } })
  async registerDevice(name: string): Promise<{ id: string }> {
    this.authorize();
    this.requireSetup();
    if (typeof name !== "string" || !name.trim() || name.length > MAX_DEVICE_NAME) {
      throw new WebdaError.BadRequest(`Device name must be 1 to ${MAX_DEVICE_NAME} characters`);
    }
    if (this.devices.length >= MAX_DEVICES) {
      throw new WebdaError.Conflict(`At most ${MAX_DEVICES} devices can be registered`);
    }
    const id = randomUUID();
    this.devices.push({ id, name: name.trim(), createdAt: Date.now() });
    await this.saveOwner();
    return { id };
  }

  /**
   * Forget a device (its local blob stays usable until the keyring key is rotated); the last device cannot go while
   * no escrow exists (409)
   * @param id - device id
   */
  @Action({ rest: { method: "DELETE" } })
  async revokeDevice(id: string): Promise<void> {
    this.authorize();
    const index = this.devices.findIndex(d => d.id === id);
    if (index < 0) {
      throw new WebdaError.NotFound("Unknown device");
    }
    if (this.devices.length === 1 && Object.keys(this.__escrows ?? {}).length === 0) {
      throw new WebdaError.Conflict("The last device cannot be revoked while no escrow exists");
    }
    this.devices.splice(index, 1);
    await this.saveOwner();
  }
}
