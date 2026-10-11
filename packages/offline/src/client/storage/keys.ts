/**
 * Source of a key-encryption key (KEK) used to wrap the storage data key.
 * One provider is, for example, a passphrase or a WebAuthn PRF credential.
 */
export interface KeyProvider {
  /** Stable identifier, used in the meta key `__encryption.keys.<id>` */
  readonly id: string;
  /**
   * Obtain the key-encryption key
   * @returns an AES-KW CryptoKey allowed to wrapKey and unwrapKey
   */
  unlock(): Promise<CryptoKey>;
}
