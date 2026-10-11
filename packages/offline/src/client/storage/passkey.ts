import type { KeyProvider } from "./keys.js";

/** Error codes of {@link PasskeyKeyProviderError} */
export type PasskeyKeyProviderErrorCode = "PRF_UNSUPPORTED" | "CANCELLED";

/**
 * Error raised by {@link PasskeyKeyProvider}
 */
export class PasskeyKeyProviderError extends Error {
  /**
   * @param code PRF_UNSUPPORTED when WebAuthn or the PRF extension is unavailable, CANCELLED when no assertion was produced
   * @param message human readable description
   */
  constructor(
    public readonly code: PasskeyKeyProviderErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PasskeyKeyProviderError";
  }
}

/** Options of {@link PasskeyKeyProvider} */
export interface PasskeyKeyProviderOptions {
  /** Credential id of the passkey, base64url encoded */
  credentialId: string;
  /** Application label: PRF evaluation input and HKDF `info` (e.g. "myapp-v1") */
  label: string;
  /** Relying party id, defaults to the current origin's effective domain */
  rpId?: string;
  /** Challenge generator, defaults to 32 random bytes (the assertion is only checked locally, never sent to a server) */
  challenge?: () => Promise<Uint8Array>;
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

const fromBase64Url = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

/**
 * Key provider deriving the key-encryption key from a passkey through the WebAuthn PRF extension.
 *
 * The PRF output is run through HKDF-SHA-256 (salt = PRF output, info = label) into a non-extractable AES-KW key.
 * The same passkey and label always yield the same key.
 */
export class PasskeyKeyProvider implements KeyProvider {
  /** Provider id, `passkey:<credentialId>` */
  readonly id: string;

  /**
   * @param options credential, label and optional WebAuthn parameters
   */
  constructor(private readonly options: PasskeyKeyProviderOptions) {
    this.id = "passkey:" + options.credentialId;
  }

  /**
   * Whether the environment advertises WebAuthn PRF support.
   * Some browsers only reveal PRF support in the assertion result, so a false here is not final: {@link unlock}
   * is the authority.
   * @returns true when `PublicKeyCredential.getClientCapabilities()` reports `extension:prf`; never throws
   */
  static async isSupported(): Promise<boolean> {
    try {
      const pkc = (globalThis as any).PublicKeyCredential;
      if (!pkc || typeof pkc.getClientCapabilities !== "function") {
        return false;
      }
      const caps = await pkc.getClientCapabilities();
      return caps?.["extension:prf"] === true;
    } catch {
      return false;
    }
  }

  /**
   * Extension input to pass as `extensions` to `navigator.credentials.create` so the new passkey supports PRF.
   * Only enables PRF; the evaluation happens at assertion time in {@link unlock}.
   * @param label application label (unused at registration, kept for symmetry with the constructor option)
   * @returns the extension inputs, `{ prf: {} }`
   */
  static prfRegistrationExtension(label: string): AuthenticationExtensionsClientInputs {
    void label;
    return { prf: {} } as AuthenticationExtensionsClientInputs;
  }

  /**
   * Prompt the user (user verification required) and derive the key-encryption key
   * @returns a non-extractable AES-KW key
   * @throws PasskeyKeyProviderError PRF_UNSUPPORTED when WebAuthn or the PRF result is missing, CANCELLED when no assertion
   */
  async unlock(): Promise<CryptoKey> {
    const credentials = (globalThis as any).navigator?.credentials;
    if (!credentials?.get) {
      throw new PasskeyKeyProviderError("PRF_UNSUPPORTED", "WebAuthn is not available");
    }
    const label = utf8(this.options.label);
    const challenge = this.options.challenge
      ? await this.options.challenge()
      : crypto.getRandomValues(new Uint8Array(32));
    const publicKey: any = {
      challenge,
      allowCredentials: [{ type: "public-key", id: fromBase64Url(this.options.credentialId) }],
      userVerification: "required",
      extensions: { prf: { eval: { first: label } } }
    };
    if (this.options.rpId) {
      publicKey.rpId = this.options.rpId;
    }
    const assertion = await credentials.get({ publicKey });
    if (!assertion) {
      throw new PasskeyKeyProviderError("CANCELLED", "No passkey assertion returned");
    }
    const first = assertion.getClientExtensionResults?.()?.prf?.results?.first;
    if (!first) {
      throw new PasskeyKeyProviderError("PRF_UNSUPPORTED", "The passkey did not return a PRF result");
    }
    const prf = ArrayBuffer.isView(first)
      ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength)
      : new Uint8Array(first);
    const material = await crypto.subtle.importKey("raw", prf, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: prf, info: label },
      material,
      { name: "AES-KW", length: 256 },
      false,
      ["wrapKey", "unwrapKey"]
    );
  }
}
