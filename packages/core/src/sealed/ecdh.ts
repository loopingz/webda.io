import { aeadDecrypt, aeadEncryptWithIv, assertVersion, decodeField, FORMAT_VERSION, IV_LENGTH } from "./aead.js";
import { b64u, concat, utf8, type CryptoKeyPair, type JsonWebKey, type Bytes } from "./encoding.js";
import { SealedFormatError } from "./errors.js";

const subtle = () => globalThis.crypto.subtle;
const EC = { name: "ECDH", namedCurve: "P-256" } as const;
/** HKDF info string for field sealing */
const INFO = utf8("webda-sealed-v1");
const KID_LENGTH = 16;

/** Sealed value envelope: ECDH-ES (ephemeral key `epk`) + HKDF-SHA-256 + AES-256-GCM */
export type SealedEnvelope = { v: 1; kid: string; epk: JsonWebKey; iv: string; ct: string };

/** A recipient public key */
export type PublicKeyEntry = { kid: string; jwk: JsonWebKey };

/** Raw uncompressed public points of private keys, so that opening works with non-extractable private keys */
const publicRawOf = new WeakMap<CryptoKey, Bytes>();

/**
 * Remember the raw public point of a private key
 * @param privateKey - private key
 * @param publicRaw - matching raw uncompressed public point
 */
export function registerPublicRaw(privateKey: CryptoKey, publicRaw: Bytes): void {
  publicRawOf.set(privateKey, publicRaw);
}

/**
 * Raw uncompressed point of a public JWK (private members and key_ops are ignored)
 * @param jwk - public key
 * @returns 65 bytes
 */
export async function rawPublic(jwk: JsonWebKey): Promise<Bytes> {
  const { key_ops: _ops, ext: _ext, d: _d, ...pub } = jwk;
  const key = await subtle().importKey("jwk", pub, EC, true, []);
  return new Uint8Array(await subtle().exportKey("raw", key));
}

/**
 * Fingerprint of a public key
 * @param publicJwk - P-256 public key
 * @returns base64url SHA-256 of the raw uncompressed point
 */
export async function fingerprint(publicJwk: JsonWebKey): Promise<string> {
  return b64u.encode(new Uint8Array(await subtle().digest("SHA-256", await rawPublic(publicJwk))));
}

/**
 * Generate a P-256 ECDH key pair. The private key is extractable so the caller can put it in the keyring.
 * @returns private key, public JWK and `kid` (first 16 characters of the fingerprint)
 */
export async function generateUserKeyPair(): Promise<{ privateKey: CryptoKey; publicJwk: JsonWebKey; kid: string }> {
  const pair = (await subtle().generateKey(EC, true, ["deriveBits"])) as CryptoKeyPair;
  const { key_ops: _ops, ext: _ext, ...publicJwk } = (await subtle().exportKey("jwk", pair.publicKey)) as JsonWebKey;
  registerPublicRaw(pair.privateKey, await rawPublic(publicJwk));
  return { privateKey: pair.privateKey, publicJwk, kid: (await fingerprint(publicJwk)).substring(0, KID_LENGTH) };
}

/**
 * AAD of a sealed field
 * @param modelType - model type
 * @param uuid - record uuid
 * @param field - field name
 * @param kid - recipient key id
 * @returns the AAD string
 */
export function fieldAad(modelType: string, uuid: string, field: string, kid: string): string {
  return `${modelType}|${uuid}|${field}|${kid}`;
}

/**
 * ECDH + HKDF-SHA-256 to an AES-GCM key, salt is ephemeral and recipient raw public points
 * @param privateKey - local private key
 * @param peerPublic - peer public key
 * @param ephemeralRaw - raw ephemeral public point
 * @param recipientRaw - raw recipient public point
 * @returns the AES key
 */
async function deriveAesKey(
  privateKey: CryptoKey,
  peerPublic: CryptoKey,
  ephemeralRaw: Bytes,
  recipientRaw: Bytes
): Promise<CryptoKey> {
  const secret = await subtle().deriveBits({ name: "ECDH", public: peerPublic }, privateKey, 256);
  const hkdfKey = await subtle().importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: concat(ephemeralRaw, recipientRaw),
      info: INFO
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Deterministic core of {@link sealValue} with explicit ephemeral key pair and IV (test vectors only, not exported
 * from the index)
 * @param ephemeral - ephemeral key pair
 * @param iv - 12 bytes
 * @param recipient - recipient public key
 * @param value - JSON-encodable value
 * @param aad - additional authenticated data
 * @returns the envelope
 */
export async function sealWith(
  ephemeral: CryptoKeyPair,
  iv: Bytes,
  recipient: PublicKeyEntry,
  value: unknown,
  aad: string
): Promise<SealedEnvelope> {
  const recipientRaw = await rawPublic(recipient.jwk);
  const recipientKey = await subtle().importKey("raw", recipientRaw, EC, false, []);
  const ephemeralRaw = new Uint8Array(await subtle().exportKey("raw", ephemeral.publicKey));
  const aes = await deriveAesKey(ephemeral.privateKey, recipientKey, ephemeralRaw, recipientRaw);
  const ct = await aeadEncryptWithIv(aes, iv, utf8(JSON.stringify(value)), aad);
  const { key_ops: _ops, ext: _ext, ...epk } = (await subtle().exportKey("jwk", ephemeral.publicKey)) as JsonWebKey;
  return { v: FORMAT_VERSION, kid: recipient.kid, epk, iv: b64u.encode(iv), ct: b64u.encode(ct) };
}

/**
 * Seal a value to a public key: the plaintext can only be opened with the matching private key
 * @param value - JSON-encodable value
 * @param recipient - recipient `kid` and public JWK
 * @param aad - additional authenticated data, see {@link fieldAad}
 * @returns the envelope
 */
export async function sealValue(value: unknown, recipient: PublicKeyEntry, aad: string): Promise<SealedEnvelope> {
  const ephemeral = (await subtle().generateKey(EC, true, ["deriveBits"])) as CryptoKeyPair;
  return sealWith(ephemeral, globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH)), recipient, value, aad);
}

/**
 * Open a sealed value
 * @param env - envelope
 * @param privateKey - recipient private key
 * @param aad - additional authenticated data the value was sealed with
 * @returns the value
 */
export async function openValue<T = unknown>(env: SealedEnvelope, privateKey: CryptoKey, aad: string): Promise<T> {
  assertVersion(env, "sealed envelope");
  if (typeof env.kid !== "string" || typeof env.epk !== "object" || env.epk === null) {
    throw new SealedFormatError("Malformed sealed envelope");
  }
  decodeField(env.iv, "iv");
  decodeField(env.ct, "ct");
  let ephemeralRaw: Bytes;
  let ephemeralKey: CryptoKey;
  try {
    ephemeralRaw = await rawPublic(env.epk);
    ephemeralKey = await subtle().importKey("raw", ephemeralRaw, EC, false, []);
  } catch {
    throw new SealedFormatError("Invalid ephemeral public key");
  }
  let recipientRaw = publicRawOf.get(privateKey);
  if (!recipientRaw) {
    // Only possible for an extractable private key
    const { d: _d, key_ops: _ops, ext: _ext, ...pub } = (await subtle().exportKey("jwk", privateKey)) as JsonWebKey;
    recipientRaw = await rawPublic(pub);
  }
  const aes = await deriveAesKey(privateKey, ephemeralKey, ephemeralRaw, recipientRaw);
  const plain = await aeadDecrypt(aes, env, aad);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
