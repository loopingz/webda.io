import { useDynamicService } from "../core/hooks.js";

/**
 * @returns the CryptoService
 * @throws Error when no CryptoService is available
 */
function crypto(): { encrypt(data: any): Promise<string>; decrypt(token: string): Promise<any> } {
  const service = useDynamicService<any>("CryptoService");
  if (!service) {
    throw new Error("Encrypted fields require the CryptoService");
  }
  return service;
}

/**
 * A model field encrypted at rest with the CryptoService
 *
 * Only the ciphertext is stored (`__ciphertext`, server-only: `__` keys never reach a public output). The value is
 * JSON-serialised, encrypted with the current symmetric key (AES, with a random IV) and wrapped in a JWT signed with
 * that key, so tampering is detected; values encrypted before a key rotation still decrypt while the CryptoService
 * keeps the old key.
 *
 * ```typescript
 * class MyModel extends UuidModel {
 *   secret: EncryptedField<{ apiKey: string }>;
 * }
 * await model.secret.set({ apiKey: "..." });
 * await model.save();
 * const { apiKey } = await model.secret.get();
 * ```
 * @WebdaBehavior Webda/Encrypted
 */
export class EncryptedField<T = any> {
  /** Encrypted value (a JWT wrapping the AES ciphertext), never output */
  __ciphertext?: string;

  /**
   * @returns true when a value is stored
   */
  isSet(): boolean {
    return typeof this.__ciphertext === "string" && this.__ciphertext.length > 0;
  }

  /**
   * Encrypt and store a value (does not save the model); undefined clears it
   * @param value - value to store, JSON-serialisable
   */
  async set(value: T | undefined): Promise<void> {
    if (value === undefined) {
      this.clear();
      return;
    }
    this.__ciphertext = await crypto().encrypt(value);
  }

  /**
   * Decrypt the stored value
   * @returns the value, undefined when none is stored
   * @throws Error when the ciphertext is invalid (tampered, or encrypted with an unknown key)
   */
  async get(): Promise<T | undefined> {
    if (!this.isSet()) {
      return undefined;
    }
    return crypto().decrypt(this.__ciphertext);
  }

  /**
   * Remove the stored value (does not save the model)
   */
  clear(): void {
    this.__ciphertext = undefined;
  }
}
