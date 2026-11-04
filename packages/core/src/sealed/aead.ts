import { b64u, utf8, type Bytes } from "./encoding.js";
import { SealedFormatError } from "./errors.js";

/** Envelope and blob format version */
export const FORMAT_VERSION = 1;
/** AES-GCM IV length in bytes */
export const IV_LENGTH = 12;

/** IV and ciphertext (with tag), base64url */
export type AeadBlob = { iv: string; ct: string };

const subtle = () => globalThis.crypto.subtle;

/**
 * Check the `v` field of an envelope or blob
 * @param obj - parsed object
 * @param what - label for the error message
 */
export function assertVersion(obj: unknown, what: string): void {
  if (typeof obj !== "object" || obj === null) {
    throw new SealedFormatError(`${what} is not an object`);
  }
  if ((obj as { v?: unknown }).v !== FORMAT_VERSION) {
    throw new SealedFormatError(`Unsupported ${what} version ${String((obj as { v?: unknown }).v)}`);
  }
}

/**
 * Decode a base64url field, mapping failures to SealedFormatError
 * @param value - field value
 * @param what - label for the error message
 * @returns decoded bytes
 */
export function decodeField(value: unknown, what: string): Bytes {
  try {
    return b64u.decode(value as string);
  } catch {
    throw new SealedFormatError(`${what} is not valid base64url`);
  }
}

/**
 * Import raw bytes as an AES-GCM key
 * @param raw - 32 key bytes
 * @param extractable - whether the key can be exported (needed to wrap it)
 * @returns the key
 */
export function importAesKey(raw: Bytes, extractable = false): Promise<CryptoKey> {
  return subtle().importKey("raw", raw, { name: "AES-GCM" }, extractable, ["encrypt", "decrypt"]);
}

/**
 * AES-256-GCM encrypt with an explicit IV (never reuse an IV with the same key)
 * @param key - AES-GCM key
 * @param iv - 12 bytes
 * @param plaintext - data
 * @param aad - additional authenticated data
 * @returns ciphertext with tag
 */
export async function aeadEncryptWithIv(key: CryptoKey, iv: Bytes, plaintext: Bytes, aad: string): Promise<Bytes> {
  return new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: iv, additionalData: utf8(aad) }, key, plaintext));
}

/**
 * AES-256-GCM encrypt with a random IV
 * @param key - AES-GCM key
 * @param plaintext - data
 * @param aad - additional authenticated data
 * @returns base64url IV and ciphertext
 */
export async function aeadEncrypt(key: CryptoKey, plaintext: Bytes, aad: string): Promise<AeadBlob> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  return { iv: b64u.encode(iv), ct: b64u.encode(await aeadEncryptWithIv(key, iv, plaintext, aad)) };
}

/**
 * AES-256-GCM decrypt. Wrong key or AAD surfaces as a WebCrypto `OperationError`.
 * @param key - AES-GCM key
 * @param blob - base64url IV and ciphertext
 * @param blob.iv - IV
 * @param blob.ct - ciphertext
 * @param aad - additional authenticated data
 * @returns plaintext
 */
export async function aeadDecrypt(key: CryptoKey, blob: AeadBlob, aad: string): Promise<Bytes> {
  const iv = decodeField(blob.iv, "iv");
  const ct = decodeField(blob.ct, "ct");
  if (iv.length !== IV_LENGTH || ct.length < 16) {
    throw new SealedFormatError("Truncated iv or ciphertext");
  }
  return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: iv, additionalData: utf8(aad) }, key, ct));
}
