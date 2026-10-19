import { argon2id } from "hash-wasm";
import { aeadDecrypt, aeadEncrypt, type AeadBlob, assertVersion, decodeField, importAesKey } from "./aead.js";
import { b64u, utf8, type Bytes } from "./encoding.js";
import { SealedFormatError } from "./errors.js";
import { assertRecoveryCode } from "./recovery.js";

const subtle = () => globalThis.crypto.subtle;

/** Supported password KDFs */
export type KdfName = "argon2id" | "pbkdf2-sha256";
/** Argon2id parameters: memory in KiB, iterations, lanes */
export type Argon2Params = { m: number; t: number; p: number };
/** PBKDF2-SHA-256 parameters */
export type Pbkdf2Params = { iterations: number };

/** Keyring key wrapped by a KDF-derived KEK (AES-GCM), the parameters are stored so they can evolve */
export type EscrowBlob = {
  v: 1;
  kind: "password" | "recovery";
  kdf: KdfName;
  kdfParams: object;
  salt: string;
  iv: string;
  ct: string;
};

/** Default Argon2id parameters */
export const ARGON2_DEFAULTS: Argon2Params = { m: 65536, t: 3, p: 1 };
/** Default PBKDF2 parameters (fallback when WASM is unavailable) */
export const PBKDF2_DEFAULTS: Pbkdf2Params = { iterations: 600000 };
const SALT_LENGTH = 16;

const inRange = (n: unknown, min: number, max: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

/**
 * Derive an AES-GCM-256 KEK from a secret. Both KDFs produce the same key type.
 * @param secret - password or recovery code (recovery codes are normalized by the escrow helpers)
 * @param salt - KDF salt
 * @param kdf - algorithm
 * @param params - algorithm parameters
 * @returns the KEK
 */
export async function deriveKek(secret: string, salt: Bytes, kdf: KdfName, params: object): Promise<CryptoKey> {
  if (kdf === "argon2id") {
    const { m, t, p } = params as Argon2Params;
    if (!inRange(m, 8, 262144) || !inRange(t, 1, 10) || !inRange(p, 1, 4)) {
      throw new SealedFormatError("Invalid argon2id parameters (m 8..262144 KiB, t 1..10, p 1..4)");
    }
    const raw = await argon2id({
      password: utf8(secret),
      salt,
      memorySize: m,
      iterations: t,
      parallelism: p,
      hashLength: 32,
      outputType: "binary"
    });
    return importAesKey(raw as Bytes);
  }
  if (kdf === "pbkdf2-sha256") {
    const { iterations } = params as Pbkdf2Params;
    if (!inRange(iterations, 100000, 2000000)) {
      throw new SealedFormatError("Invalid pbkdf2-sha256 parameters (iterations 100000..2000000)");
    }
    const base = await subtle().importKey("raw", utf8(secret), "PBKDF2", false, ["deriveKey"]);
    return subtle().deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }
  throw new SealedFormatError(`Unsupported kdf ${String(kdf)}`);
}

/**
 * Wrap the keyring key under a KDF KEK with AES-GCM
 * @param key - keyring key (extractable)
 * @param kek - KEK from {@link deriveKek}
 * @param aad - additional authenticated data
 * @returns base64url IV and ciphertext
 */
export async function wrapKeyringKey(key: CryptoKey, kek: CryptoKey, aad: string): Promise<AeadBlob> {
  return aeadEncrypt(kek, new Uint8Array(await subtle().exportKey("raw", key)), aad);
}

/**
 * Unwrap a keyring key wrapped with {@link wrapKeyringKey}. The result is extractable so it can be re-wrapped.
 * @param wrapped - IV and ciphertext
 * @param kek - KEK from {@link deriveKek}
 * @param aad - additional authenticated data
 * @returns the keyring key
 */
export async function unwrapKeyringKey(wrapped: AeadBlob, kek: CryptoKey, aad: string): Promise<CryptoKey> {
  const raw = await aeadDecrypt(kek, wrapped, aad);
  if (raw.length !== 32) {
    throw new SealedFormatError("Unexpected keyring key length");
  }
  return importAesKey(raw, true);
}

/**
 * AAD of an escrow blob
 * @param userId - owner
 * @param kind - escrow kind
 * @returns the AAD string
 */
export function escrowAad(userId: string, kind: EscrowBlob["kind"]): string {
  return `webda-escrow|${userId}|${kind}`;
}

const secretOf = (kind: EscrowBlob["kind"], secret: string) =>
  kind === "recovery" ? assertRecoveryCode(secret) : secret;

/**
 * Create an escrow blob: the keyring key wrapped by a KEK derived from a password or recovery code
 * @param kind - password or recovery
 * @param secret - password or recovery code
 * @param keyringKey - key to escrow
 * @param userId - owner
 * @param kdf - algorithm, Argon2id by default
 * @returns the blob
 */
export async function createEscrowBlob(
  kind: EscrowBlob["kind"],
  secret: string,
  keyringKey: CryptoKey,
  userId: string,
  kdf: KdfName = "argon2id"
): Promise<EscrowBlob> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const kdfParams = { ...(kdf === "argon2id" ? ARGON2_DEFAULTS : PBKDF2_DEFAULTS) };
  const kek = await deriveKek(secretOf(kind, secret), salt, kdf, kdfParams);
  return {
    v: 1,
    kind,
    kdf,
    kdfParams,
    salt: b64u.encode(salt),
    ...(await wrapKeyringKey(keyringKey, kek, escrowAad(userId, kind)))
  };
}

/**
 * Recover the keyring key from an escrow blob. A wrong secret or user surfaces as a WebCrypto `OperationError`.
 * @param blob - escrow blob
 * @param secret - password or recovery code
 * @param userId - owner
 * @returns the keyring key
 */
export async function openEscrowBlob(blob: EscrowBlob, secret: string, userId: string): Promise<CryptoKey> {
  assertVersion(blob, "escrow blob");
  if (blob.kind !== "password" && blob.kind !== "recovery") {
    throw new SealedFormatError(`Unsupported escrow kind ${String(blob.kind)}`);
  }
  const salt = decodeField(blob.salt, "salt");
  const kek = await deriveKek(secretOf(blob.kind, secret), salt, blob.kdf, blob.kdfParams ?? {});
  return unwrapKeyringKey(blob, kek, escrowAad(userId, blob.kind));
}
