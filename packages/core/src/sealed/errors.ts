/** Malformed sealed envelope, keyring or escrow blob: unknown version, bad encoding or unsupported KDF. */
export class SealedFormatError extends Error {
  /**
   * @param message - error message
   */
  constructor(message: string) {
    super(message);
    this.name = "SealedFormatError";
  }
}

/** A private key of the keyring does not match the public key served for it (public key pinning failed). */
export class KeyringPinError extends Error {
  /**
   * @param message - error message
   */
  constructor(message = "Keyring private key does not match the pinned public key") {
    super(message);
    this.name = "KeyringPinError";
  }
}
