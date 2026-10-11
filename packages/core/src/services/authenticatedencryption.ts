import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Authenticated encryption helpers used by the configuration encrypters
 *
 * AES-256-GCM: the output is `base64(iv(12) | tag(16) | ciphertext)`, decryption
 * throws if the key is wrong or the data was altered.
 */
export const AuthenticatedEncryption = {
  /**
   * Encrypt a string
   * @param key - 32 bytes key
   * @param data - the plain value
   * @param aad - optional additional authenticated data, required again to decrypt
   * @returns the base64 encrypted value
   */
  encrypt(key: Uint8Array, data: string, aad?: Uint8Array): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, new Uint8Array(iv));
    if (aad) {
      cipher.setAAD(aad);
    }
    const encrypted = Buffer.concat([
      new Uint8Array(cipher.update(new Uint8Array(Buffer.from(data, "utf-8")))),
      new Uint8Array(cipher.final())
    ]);
    return Buffer.concat([new Uint8Array(iv), new Uint8Array(cipher.getAuthTag()), new Uint8Array(encrypted)]).toString(
      "base64"
    );
  },
  /**
   * Decrypt a string
   * @param key - 32 bytes key
   * @param data - the base64 encrypted value
   * @param aad - the additional authenticated data given to encrypt, if any
   * @returns the plain value
   */
  decrypt(key: Uint8Array, data: string, aad?: Uint8Array): string {
    const input = Buffer.from(data, "base64");
    if (input.length < 28) {
      throw new Error("Invalid encrypted data");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, new Uint8Array(input.subarray(0, 12)));
    decipher.setAuthTag(new Uint8Array(input.subarray(12, 28)));
    if (aad) {
      decipher.setAAD(aad);
    }
    try {
      return Buffer.concat([
        new Uint8Array(decipher.update(new Uint8Array(input.subarray(28)))),
        new Uint8Array(decipher.final())
      ]).toString("utf-8");
    } catch {
      throw new Error("Wrong key or altered data");
    }
  }
};
