import { createCipheriv, createDecipheriv, createHash, createHmac, generateKeyPairSync, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { pem2jwk } from "pem-jwk";
import * as util from "util";
import { FileUtils, JSONUtils } from "@webda/utils";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { deepmerge } from "deepmerge-ts";

import { CryptoServiceParameters, JWTOptions, KeysDefinition } from "./icryptoservice.js";
import { AuthenticatedEncryption } from "./authenticatedencryption.js";
import {
  checkKid,
  parsePkiValue,
  PKI_DEFAULT_PUBLIC_KEYS,
  PKI_MIN_BITS,
  PkiKeyring,
  pkiEncrypter
} from "./pki.encrypter.js";
import type { ConfigurationEncryption } from "../application/iconfiguration.js";
import { CodeError } from "../errors/errors.js";
import { getMachineId, useCore, useService } from "../core/hooks.js";
import { useLog, useOutput } from "../loggers/hooks.js";
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
 * - `encrypt:[<encrypter>:]<plain>` and `sencrypt:[<encrypter>:]<plain>` mark a value to encrypt
 * - `crypt:<encrypter>:<data>` decrypts to a {@link SecretString}
 * - `scrypt:<encrypter>:<data>` decrypts to a plain string
 */
const CONFIGURATION_VALUE = /^(s?)(encrypt|crypt):([\s\S]+)$/;
/**
 * The `<encrypter>:<data>` part of a configuration value
 */
const ENCRYPTER_SEGMENT = /^([A-Za-z0-9_.-]+):([\s\S]*)$/;

/**
 * A parsed encrypted or to-encrypt configuration value
 */
export interface EncryptedValue {
  mode: "encrypt" | "crypt";
  /**
   * `sencrypt:` or `scrypt:`: decrypted to a plain string instead of a SecretString
   */
  plain: boolean;
  /**
   * Encrypter name, undefined for `encrypt:<value>` when no default encrypter is set
   */
  encrypter: string | undefined;
  data: string;
  /**
   * The encrypter is written in the value, false when the default encrypter is used
   */
  explicit: boolean;
}

/**
 * Parse an encrypted or to-encrypt configuration value
 *
 * `crypt:` and `scrypt:` values always name their encrypter. For `encrypt:` and `sencrypt:`, the
 * first segment is the encrypter when it is a registered encrypter name: otherwise the whole
 * remainder is the plain value, encrypted by the default encrypter.
 *
 * @param value - the configuration value
 * @param defaultEncrypter - the encrypter of `encrypt:<value>`
 * @returns undefined if the value is not an encryption string
 */
export function parseEncryptedValue(value: string, defaultEncrypter?: string): EncryptedValue | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = CONFIGURATION_VALUE.exec(value);
  if (!match) {
    return undefined;
  }
  const plain = match[1] === "s";
  const mode = match[2] as "encrypt" | "crypt";
  const segment = ENCRYPTER_SEGMENT.exec(match[3]);
  if (mode === "crypt") {
    return segment ? { plain, mode, encrypter: segment[1], data: segment[2], explicit: true } : undefined;
  }
  if (segment && (CryptoService.getEncrypter(segment[1]) || !defaultEncrypter)) {
    // A registered encrypter, or an unknown one reported as such when there is no default
    return { plain, mode, encrypter: segment[1], data: segment[2], explicit: true };
  }
  return { plain, mode, encrypter: defaultEncrypter, data: match[3], explicit: false };
}

/**
 * Options of the configuration encryption and decryption
 */
export interface ConfigurationEncryptionOptions {
  /**
   * The encryption settings, `parameters.configurationEncryption`
   *
   * Read from `data.parameters.configurationEncryption` when not given
   */
  settings?: ConfigurationEncryption;
  /**
   * The application path, relative paths of the encrypters resolve against it
   */
  appPath?: string;
}

/**
 * State of one encryption or decryption pass
 */
interface EncryptionPass {
  settings: ConfigurationEncryption;
  context: EncrypterContext;
  /**
   * Encrypters already configured in this pass
   */
  configured: Set<string>;
  /**
   * Encrypter to re-encrypt the encrypted values with
   */
  migrate?: string;
  upgrade?: boolean;
}

/**
 * Path of the encryption settings in a configuration
 */
const SETTINGS_PATH = "parameters.configurationEncryption";

/**
 * Check that the encryption settings hold no encrypted value
 * @param settings - the settings
 * @param path - the path, for messages
 * @returns the settings
 */
function checkEncryptionSettings(settings: any, path: string = SETTINGS_PATH): ConfigurationEncryption {
  if (settings instanceof SecretString || /^s?crypt:/.test(typeof settings === "string" ? settings : "")) {
    throw new CodeError("CONFIGURATION_ENCRYPTION_INVALID", `${path} cannot be encrypted`);
  }
  if (settings !== null && typeof settings === "object") {
    for (const [key, value] of Object.entries(settings)) {
      checkEncryptionSettings(value, `${path}.${key}`);
    }
  }
  return settings;
}

/**
 * Get the application path, the current directory without application
 * @returns the path
 */
function getAppPath(): string {
  try {
    return useApplication().getPath();
  } catch {
    return process.cwd();
  }
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
 * Context given to {@link StringEncrypter.configure}
 */
export interface EncrypterContext {
  /**
   * Absolute application path, so relative key paths resolve against it
   */
  appPath: string;
  /**
   * "encrypt" when called from `webda config encrypt`, "decrypt" at runtime
   */
  mode: "encrypt" | "decrypt";
}

/**
 * Encrypt/Decrypt string
 *
 * The encrypted output is stored after `crypt:<encrypter>:` in a configuration file:
 * it must be a single-line string.
 */
export interface StringEncrypter {
  /**
   * Optional: receive `parameters.configurationEncryption.encrypters[<name>]`
   * before the first encrypt or decrypt of a configuration
   *
   * It can be called again when the configuration changes.
   *
   * @param options - the encrypter options, an empty object if not set
   * @param context - the application path and the mode
   */
  configure?(options: any, context: EncrypterContext): void | Promise<void>;
  /**
   * Optional: tell if an encrypted value must be re-encrypted by `webda config encrypt --upgrade`
   *
   * Every value is re-encrypted when it is not implemented.
   *
   * @param data - the encrypted value
   * @returns true to re-encrypt it
   */
  needsUpgrade?(data: string): boolean;
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
   * Start an encryption or decryption pass
   * @param data - the configuration
   * @param options - the options
   * @param path - the path of data
   * @param mode - encrypt or decrypt
   * @returns the pass
   */
  protected static startPass(
    data: any,
    options: ConfigurationEncryptionOptions,
    path: (string | number)[],
    mode: "encrypt" | "decrypt"
  ): EncryptionPass {
    // Read the settings from the configuration itself when given the whole configuration
    const settings = options.settings ?? (path.length === 0 ? data?.parameters?.configurationEncryption : undefined);
    return {
      settings: checkEncryptionSettings(settings ?? {}),
      context: { appPath: options.appPath ?? getAppPath(), mode },
      configured: new Set()
    };
  }

  /**
   * Get an encrypter, configured for this pass
   * @param name - the encrypter name
   * @param pass - the current pass
   * @param path - the configuration path, for messages
   * @returns the encrypter
   */
  protected static async useEncrypter(
    name: string,
    pass: EncryptionPass,
    path: (string | number)[]
  ): Promise<StringEncrypter> {
    const encrypter = CryptoService.requireEncrypter(name, path);
    if (encrypter.configure && !pass.configured.has(name)) {
      pass.configured.add(name);
      await encrypter.configure(pass.settings.encrypters?.[name] ?? {}, pass.context);
    }
    return encrypter;
  }

  /**
   * Encrypt the `encrypt:[<encrypter>:]<plain>` and `sencrypt:[<encrypter>:]<plain>` values of a configuration
   *
   * The structure is modified in place, so a comment-preserving document loaded with
   * `FileUtils.load` can be saved back with its comments.
   *
   * `encrypt:<plain>` uses the default encrypter, `parameters.configurationEncryption.default`. The output
   * always names its encrypter.
   *
   * @param data - the configuration, or a single value
   * @param options - options
   * @param options.migrate - also re-encrypt the already encrypted values with this encrypter, with the
   *   default encrypter when `""`, or with their own encrypter when `true` (same as `upgrade`)
   * @param options.upgrade - also re-encrypt the already encrypted values with their own encrypter, to its
   *   current format or key
   * @param path - the path of data, for error messages
   * @returns the encrypted data
   */
  public static async encryptConfiguration(
    data: any,
    options: { migrate?: string | boolean; upgrade?: boolean } & ConfigurationEncryptionOptions = {},
    path: (string | number)[] = []
  ): Promise<any> {
    const pass = CryptoService.startPass(data, options, path, "encrypt");
    pass.migrate = typeof options.migrate === "string" ? options.migrate : undefined;
    pass.upgrade = options.upgrade || options.migrate === true;
    if (pass.migrate === "") {
      pass.migrate = pass.settings.default;
      if (!pass.migrate) {
        throw new Error(`No default encrypter to migrate to, set ${SETTINGS_PATH}.default`);
      }
    }
    return CryptoService.encryptValues(data, pass, path);
  }

  /**
   * Encrypt the values of a configuration, see {@link encryptConfiguration}
   * @param data - the configuration, or a single value
   * @param pass - the current pass
   * @param path - the path of data
   * @returns the encrypted data
   */
  protected static async encryptValues(data: any, pass: EncryptionPass, path: (string | number)[]): Promise<any> {
    if (data !== null && typeof data === "object" && !(data instanceof SecretString)) {
      for (const i in data) {
        // The encryption settings are never encrypted
        if (path.length === 1 && path[0] === "parameters" && i === "configurationEncryption") {
          continue;
        }
        data[i] = await CryptoService.encryptValues(data[i], pass, [...path, i]);
      }
      return data;
    }
    const parsed = parseEncryptedValue(data, pass.settings.default);
    if (!parsed) {
      return data;
    }
    let { encrypter, data: plain } = parsed;
    if (parsed.mode === "crypt") {
      if (!pass.migrate && !pass.upgrade) {
        return data;
      }
      const target = pass.migrate || encrypter;
      if (target === encrypter) {
        const current = await CryptoService.useEncrypter(encrypter, pass, path);
        if (current.needsUpgrade && !current.needsUpgrade(parsed.data)) {
          return data;
        }
      }
      plain = await CryptoService.decryptValue(encrypter, parsed.data, path, pass);
      encrypter = target;
    } else if (!encrypter) {
      throw new Error(`No default encrypter for the value at ${formatPath(path)}, set ${SETTINGS_PATH}.default`);
    } else if (!CryptoService.getEncrypter(encrypter) && !pass.settings.default) {
      throw new Error(
        `Unknown encrypter '${encrypter}' at ${formatPath(path)} (registered: ${Object.keys(CryptoService.encrypters).join(", ")}), ` +
          `or set ${SETTINGS_PATH}.default to encrypt the whole value with the default encrypter`
      );
    }
    const encrypted = await (await CryptoService.useEncrypter(encrypter, pass, path)).encrypt(plain);
    return `${parsed.plain ? "s" : ""}crypt:${encrypter}:${encrypted}`;
  }

  /**
   * Decrypt one value with an encrypter, with a message that never contains the value
   * @param encrypter - the encrypter name
   * @param data - the encrypted data
   * @param path - the configuration path
   * @param pass - the current pass, to configure the encrypter
   * @returns the plain value
   */
  protected static async decryptValue(
    encrypter: string,
    data: string,
    path: (string | number)[],
    pass?: EncryptionPass
  ): Promise<string> {
    const impl = pass
      ? await CryptoService.useEncrypter(encrypter, pass, path)
      : CryptoService.requireEncrypter(encrypter, path);
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
   * @param options - the encryption settings and the application path
   * @returns the decrypted copy
   */
  public static async decryptConfiguration(
    data: any,
    path: (string | number)[] = [],
    options: ConfigurationEncryptionOptions = {}
  ): Promise<any> {
    return CryptoService.decryptValues(data, CryptoService.startPass(data, options, path, "decrypt"), path);
  }

  /**
   * Decrypt the values of a configuration, see {@link decryptConfiguration}
   * @param data - the configuration, or a single value
   * @param pass - the current pass
   * @param path - the path of data
   * @returns the decrypted copy
   */
  protected static async decryptValues(data: any, pass: EncryptionPass, path: (string | number)[]): Promise<any> {
    if (Array.isArray(data)) {
      const res = [];
      for (let i = 0; i < data.length; i++) {
        res.push(await CryptoService.decryptValues(data[i], pass, [...path, i]));
      }
      return res;
    }
    if (isPlainObject(data)) {
      const res: any = {};
      for (const i of Object.keys(data)) {
        res[i] = await CryptoService.decryptValues(data[i], pass, [...path, i]);
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
    const plain = await CryptoService.decryptValue(parsed.encrypter, parsed.data, path, pass);
    return parsed.plain ? plain : new SecretString(plain, parsed.encrypter);
  }

  /**
   * Get the encryption settings of the application, merged with the ones of a configuration file
   * @param data - the configuration file content
   * @returns the settings
   */
  protected static getEncryptionSettings(data?: any): ConfigurationEncryption {
    return checkEncryptionSettings(
      deepmerge(
        useApplication().getConfiguration()?.parameters?.configurationEncryption ?? {},
        data?.parameters?.configurationEncryption ?? {}
      )
    );
  }

  /**
   * Encrypt the marked values of a configuration file, keeping its comments
   *
   * Prefix a value with `encrypt:[<encrypter>:]` (SecretString once decrypted) or
   * `sencrypt:[<encrypter>:]` (plain string once decrypted) then run this command.
   *
   * @param file - the configuration file (json, jsonc or yaml) to update
   * @param migrate - re-encrypt the already encrypted values with this encrypter, the default one when empty
   * @param upgrade - re-encrypt the already encrypted values with their own encrypter, to its current format or key
   * @returns the number of values changed
   */
  async encryptConfigurationFile(file: string, migrate?: string, upgrade?: boolean): Promise<number> {
    return CryptoService.encryptConfigurationFile(file, migrate, upgrade);
  }

  /**
   * Encrypt the marked values of a configuration file, keeping its comments
   *
   * It only needs the loaded application: the configuration is not decrypted and no service is created.
   *
   * @param file - the configuration file (json, jsonc or yaml) to update
   * @param migrate - re-encrypt the already encrypted values with this encrypter, the default one when empty
   * @param upgrade - re-encrypt the already encrypted values with their own encrypter, to its current format or key
   * @returns the number of values changed
   */
  @Command("config encrypt", {
    description: "Encrypt the values marked with encrypt: in a configuration file",
    // No Core: runs without decrypting the configuration, its sources or the private keys
    phase: "application"
  })
  static async encryptConfigurationFile(
    /** @alias f @description Configuration file to update (json, jsonc or yaml) */
    file: string,
    /** @description Re-encrypt the already encrypted values with this encrypter, the default one when empty */
    migrate?: string,
    /** @description Re-encrypt the already encrypted values with their own encrypter, to its current format or key */
    upgrade?: boolean
  ): Promise<number> {
    const filename = resolve(useApplication().getPath(), file);
    const data = FileUtils.load(filename);
    const before = JSON.stringify(data);
    let changes = 0;
    await CryptoService.encryptConfiguration(data, {
      migrate,
      upgrade,
      settings: CryptoService.getEncryptionSettings(data),
      appPath: useApplication().getPath()
    });
    // Count the changed values without logging them
    const count = (a: any, b: any) => {
      if (a !== null && typeof a === "object") {
        Object.keys(a).forEach(k => count(a[k], b?.[k]));
      } else if (a !== b) {
        changes++;
      }
    };
    // Compare plain JSON: the comment-preserving arrays are wrapper objects
    count(JSON.parse(JSON.stringify(data)), JSON.parse(before));
    if (changes) {
      FileUtils.save(data, filename);
    }
    useLog("INFO", `${changes} value(s) encrypted in ${filename}`);
    return changes;
  }

  /**
   * Get the keyring of the `pki` encrypter, as configured for the application
   * @param data - a configuration file content, its settings override the application ones
   * @returns the keyring
   */
  protected static getPkiKeyring(data?: any): PkiKeyring {
    return new PkiKeyring(CryptoService.getEncryptionSettings(data).encrypters?.pki ?? {}, useApplication().getPath());
  }

  /**
   * Generate a key pair for the `pki` encrypter
   *
   * The public key is written in the public keys directory, to commit. The private key is written
   * outside of it, to store in the runtime secrets (a Kubernetes Secret for example), never in the repository.
   *
   * @param kid - the key id
   * @param bits - the RSA modulus length
   * @param out - the private key file
   * @returns the written files
   */
  @Command("config pki generate", {
    description: "Generate a key pair for the pki configuration encrypter",
    // No Core: runs without decrypting the configuration, its sources or the private keys
    phase: "application"
  })
  static async pkiGenerate(
    /** @description Key id, for example 2026-10 */
    kid: string,
    /** @description RSA modulus length */
    bits: number = 4096,
    /** @description Private key file, ./<kid>.pem by default */
    out?: string
  ): Promise<{ publicKey: string; privateKey: string }> {
    checkKid(kid);
    if (!(bits >= PKI_MIN_BITS)) {
      throw new Error(`RSA ${PKI_MIN_BITS} bits at least is required`);
    }
    const keyring = CryptoService.getPkiKeyring();
    const publicKey = resolve(keyring.publicKeysDir, `${kid}.pub.pem`);
    const privateKey = resolve(useApplication().getPath(), out || `${kid}.pem`);
    const fromPublicDir = relative(keyring.publicKeysDir, privateKey);
    if (!fromPublicDir.startsWith("..") && !isAbsolute(fromPublicDir)) {
      throw new Error(`The private key cannot be written in the public keys directory ${keyring.publicKeysDir}`);
    }
    for (const f of [publicKey, privateKey]) {
      if (existsSync(f)) {
        throw new Error(`${f} already exists`);
      }
    }
    const pair = generateKeyPairSync("rsa", {
      modulusLength: bits,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    mkdirSync(keyring.publicKeysDir, { recursive: true });
    writeFileSync(privateKey, pair.privateKey, { mode: 0o600, flag: "wx" });
    writeFileSync(publicKey, pair.publicKey, { flag: "wx" });
    useLog("INFO", `Public key written to ${publicKey}, commit it`);
    useLog("INFO", `Private key written to ${privateKey}, never commit it. Ignore it in git:\n  *.pem\n  !*.pub.pem`);
    useLog(
      "INFO",
      `Store it in the runtime, then delete the local file:\n  kubectl create secret generic webda-pki --from-file=${kid}.pem=${privateKey}`
    );
    useLog("INFO", `Set ${SETTINGS_PATH}.encrypters.pki.activeKey to '${kid}' to encrypt the new values with it`);
    return { publicKey, privateKey };
  }

  /**
   * List the public keys of the `pki` encrypter and the number of values encrypted with each key in a file
   *
   * A key with no value left can be retired.
   *
   * @param file - the configuration file to inspect
   * @returns the active key, the public keys and the values count by kid
   */
  @Command("config pki list", {
    description: "List the pki keys and the values encrypted with each of them",
    // No Core: runs without decrypting the configuration, its sources or the private keys
    phase: "application"
  })
  static async pkiList(
    /** @alias f @description Configuration file to inspect (json, jsonc or yaml) */
    file: string
  ): Promise<{ activeKey?: string; publicKeys: string[]; values: Record<string, number> }> {
    const filename = resolve(useApplication().getPath(), file);
    const data = FileUtils.load(filename);
    const keyring = CryptoService.getPkiKeyring(data);
    const values: Record<string, number> = {};
    const count = (value: any) => {
      if (value !== null && typeof value === "object") {
        Object.values(value).forEach(count);
        return;
      }
      const parsed = parseEncryptedValue(value);
      if (parsed?.mode !== "crypt" || parsed.encrypter !== "pki") {
        return;
      }
      let kid: string;
      try {
        kid = parsePkiValue(parsed.data).kid;
      } catch {
        kid = "<invalid>";
      }
      values[kid] = (values[kid] ?? 0) + 1;
    };
    count(data);
    const publicKeys = keyring.listKids();
    const lines = [
      `Active key: ${keyring.activeKey ?? "<none>"}`,
      `Public keys in ${keyring.publicKeysDir}: ${publicKeys.join(", ") || "<none>"}`,
      `Values in ${filename}:`
    ];
    for (const kid of [...new Set([...publicKeys, ...Object.keys(values)])].sort()) {
      lines.push(`  ${kid}${kid === keyring.activeKey ? " (active)" : ""}: ${values[kid] ?? 0}`);
    }
    useOutput(lines.join("\n"));
    return { activeKey: keyring.activeKey, publicKeys, values };
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

/**
 * Asymmetric encrypter: public keys in the repository, private keys in the runtime
 */
CryptoService.registerEncrypter("pki", pkiEncrypter);

export { AuthenticatedEncryption };

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
