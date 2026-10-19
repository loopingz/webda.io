import { aeadDecrypt, aeadEncrypt, assertVersion, decodeField } from "./aead.js";
import { fingerprint, rawPublic, registerPublicRaw, type PublicKeyEntry } from "./ecdh.js";
import { b64u, utf8, type Bytes } from "./encoding.js";
import { KeyringPinError, SealedFormatError } from "./errors.js";

const subtle = () => globalThis.crypto.subtle;
const EC = { name: "ECDH", namedCurve: "P-256" } as const;

/** All private keys of a user (PKCS#8, base64url) by `kid`, and the `kid` used for new sealed values */
export type Keyring = { keys: Record<string, string>; active: string };

/** Encrypted keyring */
export type KeyringBlob = { v: 1; iv: string; ct: string };

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
  return { v: 1, ...(await aeadEncrypt(keyringKey, utf8(JSON.stringify(keyring)), aad)) };
}

/**
 * Decrypt the keyring and verify every private key against its served public key
 * @param blob - encrypted keyring
 * @param keyringKey - AES-GCM key
 * @param userId - owner
 * @param publicKeys - public keys as served by the server
 * @returns the keyring and its private keys, imported as non-extractable keys
 */
export async function decryptKeyring(
  blob: KeyringBlob,
  keyringKey: CryptoKey,
  userId: string,
  publicKeys: PublicKeyEntry[]
): Promise<{ keyring: Keyring; privateKeys: Record<string, CryptoKey> }> {
  assertVersion(blob, "keyring");
  // The blob does not name its active key: the AAD binds it, so find the served public key that authenticates it
  let plain: Bytes | undefined;
  let authenticatedKid: string | undefined;
  for (const candidate of publicKeys) {
    try {
      plain = await aeadDecrypt(keyringKey, blob, keyringAad(userId, candidate.kid, await fingerprint(candidate.jwk)));
      authenticatedKid = candidate.kid;
      break;
    } catch (err) {
      if (err instanceof SealedFormatError) {
        throw err;
      }
    }
  }
  if (!plain) {
    throw new KeyringPinError("Keyring authentication failed: wrong key, user or public key");
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
  if (keyring.active !== authenticatedKid) {
    throw new KeyringPinError("Active public key does not match the keyring");
  }
  const privateKeys: Record<string, CryptoKey> = {};
  for (const [kid, pkcs8] of Object.entries(keyring.keys)) {
    const pub = publicKeys.find(p => p.kid === kid);
    if (!pub) {
      throw new KeyringPinError(`No public key served for kid ${kid}`);
    }
    const bytes = decodeField(pkcs8, "private key");
    const probe = await subtle().importKey("pkcs8", bytes, EC, true, ["deriveBits"]);
    const jwk = await subtle().exportKey("jwk", probe);
    if (jwk.x !== pub.jwk.x || jwk.y !== pub.jwk.y) {
      throw new KeyringPinError(`Private key ${kid} does not match its public key`);
    }
    const key = await subtle().importKey("pkcs8", bytes, EC, false, ["deriveBits"]);
    registerPublicRaw(key, await rawPublic(pub.jwk));
    privateKeys[kid] = key;
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
