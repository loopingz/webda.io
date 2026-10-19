/** Base64url (no padding) codec, UTF-8 helper and byte concatenation. Isomorphic: no Buffer, no node:*. */

/** Byte array backed by a plain ArrayBuffer, as required by WebCrypto typings */
export type Bytes = Uint8Array<ArrayBuffer>;

/** Base64url codec without padding */
export const b64u = {
  /**
   * Encode bytes
   * @param bytes - bytes to encode
   * @returns base64url string without padding
   */
  encode(bytes: Uint8Array): string {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  /**
   * Decode a base64url string
   * @param s - base64url string without padding
   * @returns decoded bytes
   */
  decode(s: string): Bytes {
    if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s)) {
      throw new TypeError("Invalid base64url string");
    }
    const std = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }
};

/**
 * UTF-8 encode a string
 * @param s - string
 * @returns bytes
 */
export function utf8(s: string): Bytes {
  return new TextEncoder().encode(s);
}

/**
 * Concatenate byte arrays
 * @param parts - arrays to join
 * @returns a new array
 */
export function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/*
 * Minimal local WebCrypto types: the core build has no DOM lib, and this module must not import node:* types.
 * They are structurally compatible with the DOM and Node definitions.
 */

/** JSON Web Key (RFC 7517) */
export interface JsonWebKey {
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
  d?: string;
  ext?: boolean;
  key_ops?: string[];
  [member: string]: unknown;
}

/** Asymmetric key pair */
export interface CryptoKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}
