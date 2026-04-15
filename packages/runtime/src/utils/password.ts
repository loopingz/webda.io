import { CryptoService, Service, ServiceParameters, StringEncrypter, useApplication } from "@webda/core";
import { WorkerInputType } from "@webda/workout";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
/**
 * Inputted password
 */
let encryptPassword;

/**
 * Derive a 256-bit encryption key from a password using scrypt
 * @param password - plaintext password to derive the key from
 * @returns 32-byte Buffer suitable for AES-256
 */
function getKey(password: string): Buffer {
  return scryptSync(password, "Webda", 64).subarray(0, 32);
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

const encrypter: StringEncrypter = {
  encrypt: async (data: string, password?: string): Promise<string> => {
    if (!password) {
      encryptPassword ??= await requestPassword();
      password = encryptPassword;
    }
    // Derive key TODO replace by a true derivation function
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-ctr", getKey(password), iv);
    return Buffer.concat([iv, cipher.update(Buffer.from(data)), cipher.final()]).toString("base64");
  },
  decrypt: async (data: string, password?: string): Promise<string> => {
    if (!password) {
      encryptPassword ??= await requestPassword();
      password = encryptPassword;
    }
    const input = Buffer.from(data, "base64");
    const iv = input.subarray(0, 16);
    const decipher = createDecipheriv("aes-256-ctr", getKey(password), iv);
    return decipher.update(input.subarray(16)).toString() + decipher.final().toString();
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
