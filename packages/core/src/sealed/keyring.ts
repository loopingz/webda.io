import { aeadDecrypt, aeadEncrypt, assertVersion, decodeField } from "./aead.js";
import { fingerprint, rawPublic, type OpenRecipient, type PublicKeyEntry } from "./ecdh.js";
import { b64u, utf8, type Bytes, type JsonWebKey } from "./encoding.js";
import { KeyringPinError, SealedFormatError } from "./errors.js";

const subtle = () => globalThis.crypto.subtle;
const EC = { name: "ECDH", namedCurve: "P-256" } as const;

/** All private keys of a user (PKCS#8, base64url) by `kid`, and the `kid` used for new sealed values */
export type Keyring = { keys: Record<string, string>; active: string };

/** Encrypted keyring: `kid` is the active key, in clear but bound by the AAD */
export type KeyringBlob = { v: 1; kid: string; iv: string; ct: string };

/**
 * AAD of an encrypted keyring: pins it to the user and to the active public key
 * @param userId - owner
 * @param kid - active key id
 * @param fp - fingerprint of the active public key
 * @returns the AAD string
 */
export function keyringAad(userId: string, kid: string, fp: string): string {
  return `webda-keyring|${userId}|${kid}|${fp}`;
}

/**
 * Random AES-GCM-256 keyring key, extractable so it can be wrapped by KEKs
 * @returns the key
 */
export function createKeyringKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/**
 * Constant-shape byte comparison
 * @param a - first array
 * @param b - second array
 * @returns true when equal
 */
function sameBytes(a: Bytes, b: Bytes): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Keyring AAD from the active public key
 * @param userId - owner
 * @param active - active kid
 * @param publicKeys - public keys
 * @returns the AAD string
 */
async function activeAad(userId: string, active: string, publicKeys: PublicKeyEntry[]): Promise<string> {
  const entry = publicKeys.find(p => p.kid === active);
  if (!entry) {
    throw new KeyringPinError(`No public key for active kid ${active}`);
  }
  return keyringAad(userId, active, await fingerprint(entry.jwk));
}

/**
 * Encrypt the keyring with the keyring key
 * @param keyring - private keys
 * @param keyringKey - AES-GCM key
 * @param userId - owner
 * @param publicKeys - public keys, must contain the active one (used for the AAD)
 * @returns the blob
 */
export async function encryptKeyring(
  keyring: Keyring,
  keyringKey: CryptoKey,
  userId: string,
  publicKeys: PublicKeyEntry[]
): Promise<KeyringBlob> {
  const aad = await activeAad(userId, keyring.active, publicKeys);
  return { v: 1, kid: keyring.active, ...(await aeadEncrypt(keyringKey, utf8(JSON.stringify(keyring)), aad)) };
}

/**
 * Decrypt the keyring and verify every private key against its served public key
 * @param blob - encrypted keyring
 * @param keyringKey - AES-GCM key
 * @param userId - owner
 * @param publicKeys - public keys as served by the server
 * @returns the keyring and, by kid, its non-extractable private keys with their public JWKs
 */
export async function decryptKeyring(
  blob: KeyringBlob,
  keyringKey: CryptoKey,
  userId: string,
  publicKeys: PublicKeyEntry[]
): Promise<{ keyring: Keyring; privateKeys: Record<string, OpenRecipient> }> {
  assertVersion(blob, "keyring");
  if (typeof blob.kid !== "string") {
    throw new SealedFormatError("Malformed keyring blob");
  }
  const active = publicKeys.find(p => p.kid === blob.kid);
  if (!active) {
    throw new KeyringPinError(`No public key served for active kid ${blob.kid}`);
  }
  let plain: Bytes;
  try {
    plain = await aeadDecrypt(keyringKey, blob, keyringAad(userId, blob.kid, await fingerprint(active.jwk)));
  } catch (err) {
    if (err instanceof SealedFormatError) {
      throw err;
    }
    throw new KeyringPinError(
      `Keyring authentication failed for kid ${blob.kid}: wrong keyring key, user or public key`
    );
  }
  let keyring: Keyring;
  try {
    keyring = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new SealedFormatError("Keyring is not valid JSON");
  }
  if (!keyring || typeof keyring.keys !== "object" || !keyring.keys || !keyring.keys[keyring.active]) {
    throw new SealedFormatError("Malformed keyring");
  }
  if (keyring.active !== blob.kid) {
    throw new KeyringPinError("Keyring active kid differs from the authenticated blob kid");
  }
  const privateKeys: Record<string, OpenRecipient> = {};
  for (const [kid, pkcs8] of Object.entries(keyring.keys)) {
    const pub = publicKeys.find(p => p.kid === kid);
    if (!pub) {
      throw new KeyringPinError(`No public key served for kid ${kid}`);
    }
    const bytes = decodeField(pkcs8, "private key");
    const probe = await subtle().importKey("pkcs8", bytes, EC, true, ["deriveBits"]);
    const { d: _d, ...probePublic } = (await subtle().exportKey("jwk", probe)) as JsonWebKey;
    if (!sameBytes(await rawPublic(probePublic), await rawPublic(pub.jwk))) {
      throw new KeyringPinError(`Private key ${kid} does not match its public key`);
    }
    privateKeys[kid] = {
      privateKey: await subtle().importKey("pkcs8", bytes, EC, false, ["deriveBits"]),
      publicJwk: pub.jwk
    };
  }
  return { keyring, privateKeys };
}

/**
 * AES-KW wrap the keyring key under a platform KEK (WebAuthn PRF, OS keystore)
 * @param key - keyring key
 * @param kwKek - AES-KW key
 * @returns base64url wrapped key
 */
export async function wrapKeyringKeyKw(key: CryptoKey, kwKek: CryptoKey): Promise<string> {
  return b64u.encode(new Uint8Array(await subtle().wrapKey("raw", key, kwKek, "AES-KW")));
}

/**
 * Unwrap a keyring key wrapped with {@link wrapKeyringKeyKw}. The result is extractable on purpose, so that the
 * unlocked device can wrap it under further KEKs.
 * @param wrapped - base64url wrapped key
 * @param kwKek - AES-KW key
 * @returns the keyring key
 */
export async function unwrapKeyringKeyKw(wrapped: string, kwKek: CryptoKey): Promise<CryptoKey> {
  return subtle().unwrapKey(
    "raw",
    decodeField(wrapped, "wrapped key"),
    kwKek,
    "AES-KW",
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
