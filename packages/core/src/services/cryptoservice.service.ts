import { createCipheriv, createDecipheriv, createHash, createHmac, generateKeyPairSync, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { pem2jwk } from "pem-jwk";
import * as util from "util";
import { FileUtils, JSONUtils } from "@webda/utils";
import { resolve } from "node:path";

import { CryptoServiceParameters, JWTOptions, KeysDefinition } from "./icryptoservice.js";
import { getMachineId, useCore, useService } from "../core/hooks.js";
import { useLog } from "../loggers/hooks.js";
import { Service } from "./service.js";
import { Command } from "./command.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { Route } from "../rest/irest.js";
import { useRegistry } from "../models/registry.model.js";
import { useApplication } from "../application/hooks.js";

/**
 * Masked representation of a secret
 */
const SECRET_MASK = "********";

/**
 * A secret value decrypted from a `crypt:<encrypter>:<data>` configuration string
 *
 * The plain value is only available through {@link SecretString.getValue}: string
 * conversion, `JSON.stringify` and `util.inspect` all return a mask, so the secret
 * does not leak into logs, configuration dumps or serialized services.
 *
 * In a service parameters class, type a secret field as `string | SecretString`
 * and read it with {@link SecretString.from}.
 *
 * @type string
 */
export class SecretString {
  /**
   * Plain value, kept out of the enumerable properties
   */
  readonly #value: string;
  /**
   * Name of the encrypter that decrypted the value
   */
  readonly encrypter: string;

  /** Create a new SecretString
   * @param str - the secret value
   * @param encrypter - the encrypter name
   */
  constructor(str: string, encrypter: string) {
    this.#value = str;
    this.encrypter = encrypter;
  }

  /**
   * Extract the plain string value, warning if the string is not encrypted
   *
   * The warning never contains the value itself, only the optional path.
   *
   * @param value - the secret, or a plain string
   * @param path - the configuration path of the value, used in the warning
   * @returns the plain value
   */
  static from(value: string | SecretString, path?: string): string {
    if (value instanceof SecretString) {
      return value.getValue();
    }
    if (value !== undefined && value !== null && value !== "") {
      useLog("WARN", `A secret is not encrypted${path ? ` (${path})` : ""}, use 'webda config encrypt'`);
    }
    return value;
  }

  /**
   * Replace every SecretString in a structure by its plain value
   *
   * Use it to pass a configuration object holding secrets to a third-party client
   * that expects plain strings. The structure is copied, not modified.
   *
   * @param value - the structure to unwrap
   * @returns a copy with plain values
   */
  static unwrap<T = any>(value: T): T {
    if (value instanceof SecretString) {
      return value.getValue() as T;
    }
    if (Array.isArray(value)) {
      return value.map(v => SecretString.unwrap(v)) as T;
    }
    if (isPlainObject(value)) {
      const res: any = {};
      for (const [key, v] of Object.entries(value)) {
        res[key] = SecretString.unwrap(v);
      }
      return res;
    }
    return value;
  }

  /**
   * Get the underlying secret value
   * @returns the result string
   */
  getValue(): string {
    return this.#value;
  }
  /**
   * Return a masked representation to prevent secret leakage
   * @returns the result string
   */
  toString(): string {
    return SECRET_MASK;
  }
  /**
   * Return a masked representation to prevent secret leakage through JSON
   * @returns the result string
   */
  toJSON(): string {
    return SECRET_MASK;
  }
  /**
   * Custom inspect handler to mask the secret in Node.js util.inspect
   * @param depth - the depth level
   * @param options - the options
   * @param inspect - the inspect function
   * @returns the result
   */
  [util.inspect.custom](depth, options, inspect) {
    return SECRET_MASK;
  }
}

/**
 * Check if a value is a plain object or an object without prototype
 *
 * Class instances (SecretString, Duration...) are not plain objects.
 *
 * @param value - the value to test
 * @returns true for a plain object
 */
function isPlainObject(value: any): value is Record<string, any> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * An encrypted configuration value
 *
 * - `encrypt:<encrypter>:<plain>` and `sencrypt:<encrypter>:<plain>` mark a value to encrypt
 * - `crypt:<encrypter>:<data>` decrypts to a {@link SecretString}
 * - `scrypt:<encrypter>:<data>` decrypts to a plain string
 */
const CONFIGURATION_VALUE = /^(s?)(encrypt|crypt):([A-Za-z0-9_.-]+):([\s\S]*)$/;

/**
 * Parse an encrypted or to-encrypt configuration value
 * @param value - the configuration value
 * @returns undefined if the value is not an encryption string
 */
export function parseEncryptedValue(
  value: string
): { mode: "encrypt" | "crypt"; plain: boolean; encrypter: string; data: string } | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = CONFIGURATION_VALUE.exec(value);
  if (!match) {
    return undefined;
  }
  return { plain: match[1] === "s", mode: match[2] as "encrypt" | "crypt", encrypter: match[3], data: match[4] };
}

/**
 * Format a configuration path for messages
 * @param path - the path segments
 * @returns the dotted path
 */
function formatPath(path: (string | number)[]): string {
  return path.length ? path.join(".") : "<root>";
}

export type KeysRegistry = {
  /**
   * Contains the instanceId of the last
   * service who rotated
   */
  rotationInstance: string;
  /**
   * Key storage
   */
  [keys: `key_${string}`]: {
    publicKey: string;
    privateKey: string;
    symetric: string;
  };
  /**
   * Current key
   */
  current: string;
};

/**
 * Encrypt/Decrypt string
 *
 * The encrypted output is stored after `crypt:<encrypter>:` in a configuration file:
 * it must be a single-line string.
 */
export interface StringEncrypter {
  /**
   * Encrypt a string
   * @param data - the plain value
   * @param options - encrypter specific options
   * @returns the encrypted value
   */
  encrypt(data: string, options?: any): Promise<string>;
  /**
   * Decrypt a string
   *
   * It must throw if the data cannot be decrypted, never return garbage.
   *
   * @param data - the encrypted value
   * @param options - encrypter specific options
   * @returns the plain value
   */
  decrypt(data: string, options?: any): Promise<string>;
}

/**
 * @WebdaModda
 */
export class CryptoService<T extends CryptoServiceParameters = CryptoServiceParameters>
  extends Service<T>
  implements StringEncrypter
{
  private static encrypters: { [key: string]: StringEncrypter } = {};

  /**
   * Register an encrypter for configuration
   *
   * Values written as `encrypt:<name>:<plain>` are then encrypted by it with `webda config encrypt`,
   * and `crypt:<name>:<data>` values are decrypted by it when the configuration is loaded.
   *
   * Register it as a side effect of a module that the application loads (a Modda file), so it is
   * available before the services are created.
   *
   * @param name - the name to use, letters, digits, `_`, `-` and `.` only
   * @param encrypter - the encrypter implementation
   */
  static registerEncrypter(name: string, encrypter: StringEncrypter) {
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
      throw new Error(`Invalid encrypter name '${name}'`);
    }
    if (CryptoService.encrypters[name] && CryptoService.encrypters[name] !== encrypter) {
      useLog("WARN", `Encrypter '${name}' already registered, replacing it`);
    }
    CryptoService.encrypters[name] = encrypter;
  }

  /**
   * Get a registered encrypter
   * @param name - the encrypter name
   * @returns the encrypter or undefined
   */
  static getEncrypter(name: string): StringEncrypter | undefined {
    return CryptoService.encrypters[name];
  }

  /**
   * Get the encrypter for a value, with a helpful error if missing
   * @param name - the encrypter name
   * @param path - the configuration path, for the error message
   * @returns the encrypter
   */
  protected static requireEncrypter(name: string, path: (string | number)[]): StringEncrypter {
    const encrypter = CryptoService.encrypters[name];
    if (!encrypter) {
      const hint =
        name === "self"
          ? " ('self' is only available once a CryptoService is initialized, it cannot be used in the configuration)"
          : ` (registered: ${Object.keys(CryptoService.encrypters).join(", ")})`;
      throw new Error(`Unknown encrypter '${name}' at ${formatPath(path)}${hint}`);
    }
    return encrypter;
  }
  currentSymetricKey: string;
  currentAsymetricKey: { publicKey: string; privateKey: string };
  current: string;
  age: number;
  keys: {
    [key: string]: KeysDefinition;
  };
  /**
   * JWKS cache
   */
  jwks: {
    [key: string]: {
      n: string;
      e: string;
    };
  } = {};

  /**
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    CryptoService.encrypters["self"] = this;
    // Load keys
    if (this.parameters.autoCreate && !(await this.load())) {
      await this.rotate();
    }
    return this;
  }

  /**
   *
   * @param context - the execution context
   */
  @Route(".", ["GET"], {
    description: "Serve JWKS keys",
    get: {
      operationId: "getJWKS"
    }
  })
  async serveJWKS(context: OperationContext) {
    context.write({
      keys: Object.keys(this.keys).map(k => {
        if (!this.jwks[k]) {
          /*
            when Node >= 16
            this.jwks[k] = createPublicKey(this.keys[k].publicKey).export({ format: "jwk" });
            and remove pem-jwk
            */
          this.jwks[k] = pem2jwk(this.keys[k].publicKey);
        }
        return {
          kty: "RSA",
          kid: k,
          n: this.jwks[k].n,
          e: this.jwks[k].e
        };
      })
    });
  }

  /**
   * Load keys from registry
   * @returns true if the condition is met
   */
  async load(): Promise<boolean> {
    let load;
    try {
      load = await useRegistry().get<KeysRegistry>("keys");
    } catch (err) {}
    if (!load || !load.current) {
      return false;
    }
    this.keys = {};
    Object.keys(load)
      .filter(k => k.startsWith("key_"))
      .forEach(k => {
        this.keys[k.substring(4)] = load[k];
      });
    this.current = load.current.startsWith("init-") ? undefined : load.current;
    this.age = parseInt(this.current, 36);
    return true;
  }

  /**
   * Generate asymetric key
   * @returns the result
   */
  generateAsymetricKeys(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = generateKeyPairSync(
      // @ts-ignore
      this.parameters.asymetricType,
      // The private key passphrase can be an encrypted configuration value
      SecretString.unwrap(this.parameters.asymetricOptions)
    );
    return { publicKey: publicKey as string, privateKey: privateKey as string };
  }

  /**
   * Generate symetric key
   * @returns the result string
   */
  generateSymetricKey(): string {
    return randomBytes(this.parameters.symetricKeyLength / 8).toString("base64");
  }

  /**
   * Return current key set
   * @returns the result
   */
  async getCurrentKeys(): Promise<{ id: string; keys: KeysDefinition }> {
    if (!this.keys || !this.current || !this.keys[this.current]) {
      let msg = "";
      if (!this.keys) {
        msg = ": No keys";
      } else if (!this.current) {
        msg = ": No current key";
      } else if (!this.keys[this.current]) {
        msg = ": Current key does not match";
        msg += " (current=" + this.current + ", keys=[" + Object.keys(this.keys).join(",") + "])";
      }
      throw new Error("CryptoService not initialized" + msg);
    }
    return { keys: this.keys[this.current], id: this.current };
  }

  /**
   * Retrieve a HMAC for a string
   * @param data - the data to process
   * @param keyId to use
   * @returns the result string
   */
  public async hmac(data: string | any, keyId?: string): Promise<string> {
    if (typeof data !== "string") {
      data = JSONUtils.stringify(data);
    }
    const key = keyId ? { id: keyId, keys: this.keys[keyId] } : await this.getCurrentKeys();
    return key.id + "." + createHmac("sha256", key.keys.symetric).update(data).digest("hex");
  }

  /**
   * Verify a HMAC for a string
   * @param data - the data to process
   * @param hmac - the HMAC instance
   * @returns true if the condition is met
   */
  public async hmacVerify(data: string | any, hmac: string): Promise<boolean> {
    if (typeof data !== "string") {
      data = JSONUtils.stringify(data);
    }
    const [keyId, mac] = hmac.split(".");
    if (!(await this.checkKey(keyId))) {
      return false;
    }
    return createHmac("sha256", this.keys[keyId].symetric).update(data).digest("hex") === mac;
  }

  /**
   * JWT token generation
   * @param data - the data to process
   * @param options - the options
   * @returns the result string
   */
  public async jwtSign(data: any, options?: JWTOptions): Promise<string> {
    // Encrypted configuration values (secretOrPublicKey) are unwrapped to plain strings
    const res = SecretString.unwrap({ ...this.parameters.jwt, ...options });
    let key = res.secretOrPublicKey;
    // Default to our current private key
    if (!res.secretOrPublicKey) {
      const keyInfo = await this.getCurrentKeys();
      // Depending on the algo fallback to the right key
      if (res.algorithm.startsWith("HS")) {
        key = keyInfo.keys.symetric;
        res.keyid = "S" + keyInfo.id;
      } else {
        key = keyInfo.keys.privateKey;
        res.keyid = "A" + keyInfo.id;
      }
    }
    delete res.secretOrPublicKey;
    return jwt.sign(data, key, res);
  }

  /**
   *
   * @param keyId - the key identifier
   * @returns true if the condition is met
   */
  async checkKey(keyId: string): Promise<boolean> {
    if (!this.keys[keyId]) {
      // Key is more recent than current one so try to reload
      if (parseInt(keyId, 36) > this.age) {
        await this.load();
      }
      // Key is still not found
      if (!this.keys[keyId]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get JWT key based on kid
   * @param header - the JWT header
   * @param callback - the callback function
   */
  public async getJWTKey(header, callback) {
    if (!header.kid) {
      callback(new Error("Unknown key"));
      return;
    }
    const keyId = header.kid.substring(1);
    if (!(await this.checkKey(keyId))) {
      callback(new Error("Unknown key"));
      return;
    }
    // Check first letter that define Symetric or Asymetric
    if (header.kid.startsWith("S")) {
      callback(null, this.keys[keyId].symetric);
    } else if (header.kid.startsWith("A")) {
      callback(null, this.keys[keyId].publicKey);
    } else {
      callback(new Error("Unknown key"));
    }
  }

  /**
   * JWT token verification
   * @param token - the token
   * @param options - the options
   * @returns the result
   */
  public async jwtVerify(token: string, options?: JWTOptions): Promise<string | any> {
    // Encrypted configuration values (secretOrPublicKey) are unwrapped to plain strings
    options = SecretString.unwrap(options);
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        options?.secretOrPublicKey || this.getJWTKey.bind(this),
        {
          ...options,
          secretOrPublicKey: undefined
        },
        (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        }
      );
    });
  }

  /**
   * Encrypt data
   * @param data - the data to process
   * @returns the result string
   */
  public async encrypt(data: any): Promise<string> {
    const key = await this.getCurrentKeys();
    // Initialization Vector
    const iv = randomBytes(16);
    const symKey = new Uint8Array(Buffer.from(key.keys.symetric, "base64"));
    const cipher = createCipheriv(this.parameters.symetricCipher, symKey, new Uint8Array(iv));
    const updated = cipher.update(new Uint8Array(Buffer.from(JSON.stringify(data))));
    const final = cipher.final();
    const encrypted = Buffer.concat([new Uint8Array(iv), new Uint8Array(updated), new Uint8Array(final)]).toString(
      "base64"
    );
    return this.jwtSign(encrypted, {
      keyid: `S${key.id}`,
      secretOrPublicKey: key.keys.symetric
    });
  }

  /**
   * Parse the JWT header section
   * @param token - the token
   * @returns the result
   */
  getJWTHeader(token: string) {
    return JSON.parse(Buffer.from(token.split(".")[0], "base64").toString());
  }

  /**
   * Encrypt the `encrypt:<encrypter>:<plain>` and `sencrypt:<encrypter>:<plain>` values of a configuration
   *
   * The structure is modified in place, so a comment-preserving document loaded with
   * `FileUtils.load` can be saved back with its comments.
   *
   * @param data - the configuration, or a single value
   * @param options - options
   * @param options.migrate - also re-encrypt the already encrypted values with this encrypter,
   *   or with their own encrypter when `true` (to upgrade them to its current format)
   * @param path - the path of data, for error messages
   * @returns the encrypted data
   */
  public static async encryptConfiguration(
    data: any,
    options: { migrate?: string | boolean } = {},
    path: (string | number)[] = []
  ): Promise<any> {
    if (data !== null && typeof data === "object" && !(data instanceof SecretString)) {
      for (const i in data) {
        data[i] = await CryptoService.encryptConfiguration(data[i], options, [...path, i]);
      }
      return data;
    }
    const parsed = parseEncryptedValue(data);
    if (!parsed) {
      return data;
    }
    let { encrypter, data: plain } = parsed;
    if (parsed.mode === "crypt") {
      if (!options.migrate) {
        return data;
      }
      plain = await CryptoService.decryptValue(encrypter, parsed.data, path);
      if (typeof options.migrate === "string") {
        encrypter = options.migrate;
      }
    }
    const encrypted = await CryptoService.requireEncrypter(encrypter, path).encrypt(plain);
    return `${parsed.plain ? "s" : ""}crypt:${encrypter}:${encrypted}`;
  }

  /**
   * Decrypt one value with an encrypter, with a message that never contains the value
   * @param encrypter - the encrypter name
   * @param data - the encrypted data
   * @param path - the configuration path
   * @returns the plain value
   */
  protected static async decryptValue(encrypter: string, data: string, path: (string | number)[]): Promise<string> {
    const impl = CryptoService.requireEncrypter(encrypter, path);
    try {
      return await impl.decrypt(data);
    } catch (err) {
      throw new Error(`Cannot decrypt the value at ${formatPath(path)} with encrypter '${encrypter}': ${err.message}`);
    }
  }

  /**
   * Decrypt the `crypt:` and `scrypt:` values of a configuration
   *
   * - `crypt:<encrypter>:<data>` becomes a {@link SecretString}
   * - `scrypt:<encrypter>:<data>` becomes a plain string, for a module that cannot handle SecretString
   *
   * The input is not modified: a decrypted copy is returned. Only plain objects and
   * arrays are traversed.
   *
   * A value still marked `encrypt:` is kept as is, with a warning.
   *
   * @param data - the configuration, or a single value
   * @param path - the path of data, for messages
   * @returns the decrypted copy
   */
  public static async decryptConfiguration(data: any, path: (string | number)[] = []): Promise<any> {
    if (Array.isArray(data)) {
      const res = [];
      for (let i = 0; i < data.length; i++) {
        res.push(await CryptoService.decryptConfiguration(data[i], [...path, i]));
      }
      return res;
    }
    if (isPlainObject(data)) {
      const res: any = {};
      for (const i of Object.keys(data)) {
        res[i] = await CryptoService.decryptConfiguration(data[i], [...path, i]);
      }
      return res;
    }
    const parsed = parseEncryptedValue(data);
    if (!parsed) {
      return data;
    }
    if (parsed.mode === "encrypt") {
      useLog(
        "WARN",
        `The value at ${formatPath(path)} is marked for encryption but not encrypted, run 'webda config encrypt'`
      );
      return data;
    }
    const plain = await CryptoService.decryptValue(parsed.encrypter, parsed.data, path);
    return parsed.plain ? plain : new SecretString(plain, parsed.encrypter);
  }

  /**
   * Encrypt the marked values of a configuration file, keeping its comments
   *
   * Prefix a value with `encrypt:<encrypter>:` (SecretString once decrypted) or
   * `sencrypt:<encrypter>:` (plain string once decrypted) then run this command.
   *
   * @param file - the configuration file (json, jsonc or yaml) to update
   * @param migrate - re-encrypt the already encrypted values with this encrypter
   * @param upgrade - re-encrypt the already encrypted values with their own encrypter, to its current format
   * @returns the number of values changed
   */
  @Command("config encrypt", {
    description: "Encrypt the values marked with encrypt:<encrypter>: in a configuration file",
    phase: "resolved"
  })
  async encryptConfigurationFile(
    /** @alias f @description Configuration file to update (json, jsonc or yaml) */
    file: string,
    /** @description Re-encrypt the already encrypted values with this encrypter */
    migrate?: string,
    /** @description Re-encrypt the already encrypted values with their own encrypter */
    upgrade?: boolean
  ): Promise<number> {
    const filename = resolve(useApplication().getPath(), file);
    const data = FileUtils.load(filename);
    const before = JSON.stringify(data);
    let changes = 0;
    await CryptoService.encryptConfiguration(data, { migrate: migrate || upgrade });
    // Count the changed values without logging them
    const count = (a: any, b: any) => {
      if (a !== null && typeof a === "object") {
        Object.keys(a).forEach(k => count(a[k], b?.[k]));
      } else if (a !== b) {
        changes++;
      }
    };
    count(data, JSON.parse(before));
    if (changes) {
      FileUtils.save(data, filename);
    }
    this.log("INFO", `${changes} value(s) encrypted in ${filename}`);
    return changes;
  }

  /**
   * Decrypt data
   * @param token - the token
   * @returns the result
   */
  public async decrypt(token: string): Promise<any> {
    const input = Buffer.from(await this.jwtVerify(token), "base64");
    const header = this.getJWTHeader(token);
    const iv = input.subarray(0, 16);
    const decipher = createDecipheriv(
      this.parameters.symetricCipher,
      new Uint8Array(Buffer.from(this.keys[header.kid.substring(1)].symetric, "base64")),
      new Uint8Array(iv)
    );
    return JSON.parse(decipher.update(new Uint8Array(input.subarray(16))).toString() + decipher.final().toString());
  }

  /**
   * Get next id
   * @returns the result
   */
  getNextId(): { id: string; age: number } {
    // Should be good for years as 8char
    const age = Math.floor(Date.now() / 1000);
    return { age, id: age.toString(36) };
  }

  /**
   * Rotate keys
   */
  async rotate() {
    const { age, id } = this.getNextId();
    const registry = useRegistry();
    const next: KeysRegistry = {
      current: id,
      rotationInstance: useCore().getInstanceId()
    };
    next[`key_${id}`] = {
      ...this.generateAsymetricKeys(),
      symetric: this.generateSymetricKey()
    };
    if (!(await registry.exists("keys"))) {
      this.current = `init-${useCore().getInstanceId()}`;
      await registry.put("keys", { current: this.current });
    }
    try {
      await registry.patch("keys", next, "current", this.current);
      this.keys ??= {};
      this.keys[id] = next[`key_${id}`];
      this.current = id;
      this.age = age;
    } catch (err) {
      useLog("TRACE", "Failed to rotate keys", err);
      // Reload as something else has modified
      await this.load();
      await this.getCurrentKeys();
    }
  }
}

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
   * @returns the base64 encrypted value
   */
  encrypt(key: Uint8Array, data: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, new Uint8Array(iv));
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
   * @returns the plain value
   */
  decrypt(key: Uint8Array, data: string): string {
    const input = Buffer.from(data, "base64");
    if (input.length < 28) {
      throw new Error("Invalid encrypted data");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, new Uint8Array(input.subarray(0, 12)));
    decipher.setAuthTag(new Uint8Array(input.subarray(12, 28)));
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

/**
 * Prefix of the current encrypted format of the built-in encrypters
 *
 * Legacy values (AES-256-CTR, unauthenticated) have no prefix: base64 never contains `:`.
 */
export const ENCRYPTION_FORMAT_V2 = "v2:";

/**
 * Get the key of the local encrypter
 * @returns the key derived from the machine id
 */
function getLocalKey(): Uint8Array {
  return new Uint8Array(createHash("sha256").update(getMachineId()).digest());
}

/**
 * Encrypt data with local machine id
 *
 * The machine id is `WEBDA_MACHINE_ID` if defined, the OS machine id otherwise: a value
 * encrypted on one machine can only be decrypted on the same machine, or with the same
 * `WEBDA_MACHINE_ID`.
 */
CryptoService.registerEncrypter("local", {
  encrypt: async (data: string) => {
    return ENCRYPTION_FORMAT_V2 + AuthenticatedEncryption.encrypt(getLocalKey(), data);
  },
  decrypt: async (data: string) => {
    if (data.startsWith(ENCRYPTION_FORMAT_V2)) {
      return AuthenticatedEncryption.decrypt(getLocalKey(), data.substring(ENCRYPTION_FORMAT_V2.length));
    }
    // Legacy format: AES-256-CTR, re-encrypt with 'webda config encrypt --upgrade'
    const input = Buffer.from(data, "base64");
    const iv = input.subarray(0, 16);
    const decipher = createDecipheriv("aes-256-ctr", getLocalKey(), new Uint8Array(iv));
    return decipher.update(new Uint8Array(input.subarray(16))).toString() + decipher.final().toString();
  }
});

export default CryptoService;

/**
 * Return the CryptoService
 *
 * As it is a service, it can be used with the useService hook
 *
 * @returns the result
 */
export function useCrypto() {
  return useService("CryptoService");
}
