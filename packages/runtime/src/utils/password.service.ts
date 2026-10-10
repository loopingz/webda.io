import {
  AuthenticatedEncryption,
  CryptoService,
  ENCRYPTION_FORMAT_V2,
  Service,
  ServiceParameters,
  StringEncrypter,
  useApplication
} from "@webda/core";
import { WorkerInputType } from "@webda/workout";
import { createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Environment variable holding the configuration encryption password
 *
 * Used by servers and CI, where no password can be prompted.
 */
export const PASSWORD_ENV = "WEBDA_CONFIG_PASSWORD";

/**
 * Inputted password
 */
let encryptPassword: string;

/**
 * Derive a 256-bit encryption key from a password using scrypt
 * @param password - plaintext password to derive the key from
 * @param salt - the salt
 * @returns 32-byte Buffer suitable for AES-256
 */
function getKey(password: string, salt: Uint8Array): Uint8Array {
  return new Uint8Array(scryptSync(password, salt, 32));
}

/**
 * Legacy key derivation, with a fixed salt
 * @param password - plaintext password to derive the key from
 * @returns 32-byte Buffer suitable for AES-256
 */
function getLegacyKey(password: string): Uint8Array {
  return new Uint8Array(scryptSync(password, "Webda", 64).subarray(0, 32));
}

/**
 * Prompt the user for the encryption password via interactive terminal or worker output
 * @returns the entered password string
 */
async function requestPassword(): Promise<string> {
  /* c8 ignore next 5 */
  if (!useApplication().getWorkerOutput().interactive) {
    // Fallback to password-prompt as we have a tty
    const passwordLib = await import("password-prompt");
    return passwordLib.default("Configuration Encryption Password: ", { method: "hide" });
  }
  return await useApplication()
    .getWorkerOutput()
    .requestInput("Configuration Encryption Password", WorkerInputType.PASSWORD, [], true);
}

/**
 * Get the password: the given one, the environment variable or a prompt (asked once)
 * @param password - the password if known
 * @returns the password
 */
async function getPassword(password?: string): Promise<string> {
  if (password) {
    return password;
  }
  if (process.env[PASSWORD_ENV]) {
    return process.env[PASSWORD_ENV];
  }
  encryptPassword ??= await requestPassword();
  return encryptPassword;
}

/**
 * Salt length of the current format
 */
const SALT_LENGTH = 16;

/**
 * Encrypter with a password
 *
 * Current format: `v2:base64(salt(16) | AES-256-GCM output)` with a scrypt key derived from the password.
 * The legacy format (AES-256-CTR, fixed salt, unauthenticated) is still decrypted.
 */
const encrypter: StringEncrypter = {
  encrypt: async (data: string, password?: string): Promise<string> => {
    password = await getPassword(password);
    const salt = new Uint8Array(randomBytes(SALT_LENGTH));
    const encrypted = Buffer.from(AuthenticatedEncryption.encrypt(getKey(password, salt), data), "base64");
    return ENCRYPTION_FORMAT_V2 + Buffer.concat([salt, new Uint8Array(encrypted)]).toString("base64");
  },
  decrypt: async (data: string, password?: string): Promise<string> => {
    password = await getPassword(password);
    if (data.startsWith(ENCRYPTION_FORMAT_V2)) {
      const input = Buffer.from(data.substring(ENCRYPTION_FORMAT_V2.length), "base64");
      const salt = new Uint8Array(input.subarray(0, SALT_LENGTH));
      try {
        return AuthenticatedEncryption.decrypt(getKey(password, salt), input.subarray(SALT_LENGTH).toString("base64"));
      } catch (err) {
        throw new Error("Wrong password or altered data");
      }
    }
    // Legacy format: re-encrypt with 'webda config encrypt --upgrade'
    const input = Buffer.from(data, "base64");
    const iv = new Uint8Array(input.subarray(0, 16));
    const decipher = createDecipheriv("aes-256-ctr", getLegacyKey(password), iv);
    return decipher.update(new Uint8Array(input.subarray(16))).toString() + decipher.final().toString();
  }
};
/**
 * Register a password encrypted data
 */
CryptoService.registerEncrypter("password", encrypter);

/**
 * Webda Service to encrypt password
 *
 * @WebdaModda
 */
export class PasswordEncryptionService extends Service {
  /**
   * @override
   */
  loadParameters(params: any): ServiceParameters {
    return new ServiceParameters().load(params);
  }

  /**
   * Encrypt a string using AES-256-CTR with a password-derived key
   * @param data - plaintext to encrypt
   * @param key - optional password (prompts interactively if omitted)
   * @returns base64-encoded ciphertext with prepended IV
   */
  encrypt(data: string, key?: string): Promise<string> {
    return encrypter.encrypt(data, key);
  }

  /**
   * Decrypt a string previously encrypted with this service
   * @param data - base64-encoded ciphertext with prepended IV
   * @param key - optional password (prompts interactively if omitted)
   * @returns the decrypted plaintext string
   */
  decrypt(data: string, key?: string): Promise<string> {
    return encrypter.decrypt(data, key);
  }
}
