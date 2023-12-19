import { Core, CryptoService, DeepPartial, Service, ServiceParameters, StringEncrypter } from "@webda/core";
import { WorkerInputType } from "@webda/workout";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
/**
 * Inputted password
 */
let encryptPassword;

/**
 * Derive a key from a password
 * @param password
 * @returns
 */
function getKey(password: string): Buffer {
  return scryptSync(password, "Webda", 64).subarray(0, 32);
}

async function requestPassword(): Promise<string> {
  if (!Core.get().getWorkerOutput().interactive && process.stdin.isTTY) {
    // Fallback to password-prompt as we have a tty
    let passwordLib = await import("password-prompt");
    return passwordLib.default("Configuration Encryption Password: ", { method: "hide" });
  }
  return await Core.get()
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
    let iv = randomBytes(16);
    let cipher = createCipheriv("aes-256-ctr", getKey(password), iv);
    return Buffer.concat([iv, cipher.update(Buffer.from(data)), cipher.final()]).toString("base64");
  },
  decrypt: async (data: string, password?: string): Promise<string> => {
    if (!password) {
      encryptPassword ??= await requestPassword();
      password = encryptPassword;
    }
    let input = Buffer.from(data, "base64");
    let iv = input.subarray(0, 16);
    let decipher = createDecipheriv("aes-256-ctr", getKey(password), iv);
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
  loadParameters(params: DeepPartial<ServiceParameters>): ServiceParameters {
    return new ServiceParameters(params);
  }

  /**
   * Encrypt a data with GCP KMS given key or defaultKey
   * @param data
   * @param key
   * @returns
   */
  encrypt(data: string, key?: string): Promise<string> {
    return encrypter.encrypt(data, key);
  }

  /**
   * Decrypt a data previously encrypted with this service
   * @param data
   * @returns
   */
  decrypt(data: string, key?: string): Promise<string> {
    return encrypter.decrypt(data, key);
  }
}
