import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPublicKey,
  generateKeyPairSync,
  randomBytes
} from "crypto";
import jwt from "jsonwebtoken";
import * as util from "util";
import { FileUtils, JSONUtils } from "@webda/utils";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { deepmerge } from "deepmerge-ts";

import { CryptoServiceParameters, JWTOptions, KeysDefinition } from "./icryptoservice.js";
import { AuthenticatedEncryption } from "./authenticatedencryption.js";
import { checkKid, parsePkiValue, PKI_MIN_BITS, PkiKeyring, pkiEncrypter } from "./pki.encrypter.js";
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
import { findConfigurationSecrets, OPT_OUT_ENCRYPTER, secretPathExcluder, type SecretFinding } from "./secretscheck.js";

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
 * `@secret` marks every property typed with this class as a secret in the generated
 * schema (`x-webda-secret`), so `webda config encrypt` encrypts it and `--check` reports it when it is not encrypted.
 *
 * @type string
 * @secret
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

/**
 * Public JSON Web Key (RFC 7517) published in the JWKS
 */
export interface JsonWebKey {
  kty?: string;
  kid?: string;
  use?: string;
  alg?: string;
  [key: string]: unknown;
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
   * JWKS cache: public JWK of each key id, `null` when the key cannot be exported as a JWK
   */
  jwks: {
    [key: string]: JsonWebKey | null;
  } = {};
  /**
   * Modification time, size and inode of the keys file last read, to reload it only when it changes
   */
  protected keysFileSignature?: string;

  /**
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    CryptoService.encrypters["self"] = this;
    // Load keys
    if (this.parameters.keysFile) {
      // Fail now rather than with "No keys" at first use
      await this.refreshKeysFile();
    } else if (this.parameters.autoCreate && !(await this.load())) {
      await this.rotate();
    }
    return this;
  }

  /**
   * Url of the JWKS route, relative to the application root
   * @returns the url or undefined when the JWKS is not exposed (no `url` parameter)
   */
  getJWKSUrl(): string | undefined {
    return this.getUrl(".", ["GET"]);
  }

  /**
   * Public signing keys as a JSON Web Key Set (RFC 7517)
   *
   * Only the asymmetric public keys are published, the symmetric keys never leave the service. The `kid` matches the
   * one {@link jwtSign} writes for asymmetric tokens (`A<keyId>`), so any JOSE library can verify them. Keys of an
   * old rotation stay published while they are in the registry: tokens they signed remain verifiable.
   * @returns the key set
   */
  getJWKS(): { keys: JsonWebKey[] } {
    const algorithm = this.parameters.jwt?.algorithm;
    return {
      keys: Object.keys(this.keys || {})
        .map(k => {
          if (this.jwks[k] === undefined) {
            try {
              this.jwks[k] = createPublicKey(this.keys[k].publicKey).export({ format: "jwk" }) as JsonWebKey;
            } catch {
              // dh, x25519, ... keys have no JWK representation
              this.jwks[k] = null;
            }
          }
          if (!this.jwks[k]) {
            return undefined;
          }
          const jwk: JsonWebKey = { ...this.jwks[k], kid: "A" + k, use: "sig" };
          // Advertise the algorithm only when the default one is asymmetric: the same key can sign RS* and PS*
          if (algorithm && !algorithm.startsWith("HS")) {
            jwk.alg = algorithm;
          }
          return jwk;
        })
        .filter(k => k !== undefined)
    };
  }

  /**
   * Cache duration of the JWKS in seconds
   *
   * A tenth of the key active lifespan, between one minute and one hour: verifiers see a new key well before the
   * previous one stops signing, and unknown `kid` refetches remain rare.
   * @returns the max-age
   */
  getJWKSMaxAge(): number {
    const lifespan = this.parameters.keyActiveLifespan;
    if (!lifespan) {
      return 600;
    }
    return Math.max(60, Math.min(3600, Math.floor(lifespan * 360)));
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
    context.setHeader("Cache-Control", `public, max-age=${this.getJWKSMaxAge()}`);
    context.write(this.getJWKS());
  }

  /**
   * Load keys from registry, or from the keys file if `keysFile` is set
   * @returns true if the condition is met
   */
  async load(): Promise<boolean> {
    if (this.parameters.keysFile) {
      return this.refreshKeysFile();
    }
    let load;
    try {
      load = await useRegistry().get<KeysRegistry>("keys");
    } catch (err) {}
    if (!load || !load.current) {
      return false;
    }
    this.setKeys(load);
    return true;
  }

  /**
   * Absolute path of the keys file
   * @returns the path or undefined when the keys are in the registry
   */
  getKeysFile(): string | undefined {
    return this.parameters.keysFile ? resolve(getAppPath(), this.parameters.keysFile) : undefined;
  }

  /**
   * Read the keys file if it changed since the last read
   *
   * A file that cannot be read or is invalid fails when no keys are loaded yet. Afterwards it is logged and the
   * current keys are kept, so a broken secret update does not break the running service.
   * @returns true once the keys are loaded
   */
  protected async refreshKeysFile(): Promise<boolean> {
    const file = this.getKeysFile();
    let signature: string;
    try {
      // Checking the file metadata is cheap: an unknown key id in a token does not reparse the file
      const info = await stat(file);
      signature = `${info.mtimeMs}:${info.size}:${info.ino}`;
      if (signature === this.keysFileSignature) {
        return true;
      }
      this.setKeys(await this.readKeysFile(file));
      // Public keys of a key id can change with the file
      this.jwks = {};
    } catch (err) {
      const error = err.message.startsWith("keysFile")
        ? err
        : new Error(`Cannot read keysFile ${file}: ${err.message}`);
      if (!this.keys) {
        throw error;
      }
      this.log("WARN", `${error.message}, keeping the previous keys`);
    }
    // Do not retry an invalid file until it changes again
    this.keysFileSignature = signature;
    return true;
  }

  /**
   * Read and validate the keys file
   * @param file - the absolute path
   * @returns the keys
   */
  protected async readKeysFile(file: string): Promise<KeysRegistry> {
    let content: KeysRegistry;
    try {
      content = JSON.parse(await readFile(file, "utf-8"));
    } catch (err) {
      throw new Error(`keysFile ${file} is not valid JSON: ${err.message}`);
    }
    if (!content || typeof content !== "object" || Array.isArray(content)) {
      throw new Error(`keysFile ${file} must contain a JSON object`);
    }
    if (!content.current || typeof content.current !== "string") {
      throw new Error(`keysFile ${file} has no 'current' key id`);
    }
    if (!content[`key_${content.current}`]) {
      throw new Error(`keysFile ${file} has no 'key_${content.current}' for the current key`);
    }
    for (const id of Object.keys(content).filter(k => k.startsWith("key_"))) {
      for (const field of ["publicKey", "privateKey", "symetric"]) {
        if (typeof content[id]?.[field] !== "string") {
          throw new Error(`keysFile ${file}: ${id}.${field} must be a string`);
        }
      }
    }
    return content;
  }

  /**
   * Set the keys from their registry format
   * @param load - the keys
   */
  protected setKeys(load: KeysRegistry) {
    this.keys = {};
    Object.keys(load)
      .filter(k => k.startsWith("key_"))
      .forEach(k => {
        this.keys[k.substring(4)] = load[k];
      });
    this.current = load.current.startsWith("init-") ? undefined : load.current;
    this.age = parseInt(this.current, 36);
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
    if (this.parameters.keysFile) {
      // Pick up a new current key from an updated secret
      await this.refreshKeysFile();
    }
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
    if (this.parameters.keysFile) {
      // The file is the source of truth: a key removed from it is not accepted anymore
      await this.refreshKeysFile();
      return Object.hasOwn(this.keys, keyId);
    }
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
      // An opted-out value stays in clear text, it is not migrated to another encrypter
      if ((!pass.migrate && !pass.upgrade) || encrypter === OPT_OUT_ENCRYPTER) {
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
    return CryptoService.encryptFile(file, migrate, upgrade);
  }

  /**
   * Encrypt the secrets of the configuration files, keeping their comments, or check them
   *
   * Encrypts the values marked `encrypt:` or `sencrypt:`, and the plain values of the secret fields: the fields
   * typed `SecretString` or tagged `@secret` in their service parameters, marked `x-webda-secret` in the compiled
   * schemas. The plain secrets are encrypted with the default encrypter.
   *
   * Without `file`, it updates the application configuration and the file of the selected deployment.
   *
   * With `check`, nothing is written: it fails when a secret is not encrypted. It needs no key, so it runs in CI.
   * Only the paths are reported, never the values.
   *
   * It only needs the loaded application: the configuration is not decrypted and no service is created.
   *
   * @param file - the configuration file (json, jsonc or yaml) to update
   * @param migrate - re-encrypt the already encrypted values with this encrypter, the default one when empty
   * @param upgrade - re-encrypt the already encrypted values with their own encrypter, to its current format or key
   * @param check - only check that the secrets are encrypted, write nothing
   * @param strict - with check, report the values still marked `encrypt:` as failures
   * @param format - with check, output format: text or json
   * @param none - with check, accept the values kept in clear text with `crypt:none:`, false to fail on them
   * @param exclude - secret paths to leave alone, comma-separated: not checked, not auto-encrypted
   * @returns with check, 1 when a secret is not encrypted, otherwise 0
   */
  @Command("config encrypt", {
    description: "Encrypt the secrets of the configuration files, or check them with --check",
    // No Core: runs without decrypting the configuration, its sources or the private keys
    phase: "application"
  })
  static async encryptConfigurationFile(
    /** @alias f @description Configuration file to update (json, jsonc or yaml), the application and deployment files by default */
    file?: string,
    /** @description Re-encrypt the already encrypted values with this encrypter, the default one when empty */
    migrate?: string,
    /** @description Re-encrypt the already encrypted values with their own encrypter, to its current format or key */
    upgrade?: boolean,
    /** @description Only check that the secrets are encrypted, write nothing and fail if one is not */
    check: boolean = false,
    /** @description With --check, report the values marked encrypt: as failures */
    strict: boolean = true,
    /** @description With --check, output format: text or json */
    format: "text" | "json" = "text",
    /** @description With --check, accept the values kept in clear text with crypt:none: (--no-none to fail on them) */
    none: boolean = true,
    /** @description Secret paths to leave alone, comma-separated (services.demo.password, units[*].token, $.parameters.**) */
    exclude?: string
  ): Promise<number> {
    const files = CryptoService.getConfigurationFiles(file);
    if (check) {
      return CryptoService.checkFiles(files, { strict, format, none, exclude });
    }
    // The count is logged, not returned: a command result is its exit code
    for (const filename of files) {
      await CryptoService.encryptFile(filename, migrate, upgrade, exclude);
    }
    return 0;
  }

  /**
   * The configuration files to encrypt or check
   * @param file - the file given on the command line
   * @returns the absolute paths: the file, or the application configuration and the selected deployment file
   */
  protected static getConfigurationFiles(file?: string): string[] {
    const app = useApplication();
    if (file) {
      return [resolve(app.getPath(), file)];
    }
    const files = [app.configurationFile, app.getDeployment() ? app.deploymentFile : undefined].filter(
      f => f && existsSync(f)
    );
    if (!files.length) {
      throw new Error("No configuration file found, use --file");
    }
    return files;
  }

  /**
   * Check that the secrets of configuration files are encrypted
   * @param files - the files to check
   * @param options - check options
   * @param options.strict - report the values still marked `encrypt:` as failures
   * @param options.format - output format: text or json
   * @param options.none - accept the values kept in clear text with `crypt:none:`
   * @param options.exclude - secret paths not checked, comma-separated
   * @returns 1 when a secret is not encrypted, 0 otherwise
   */
  protected static checkFiles(
    files: string[],
    options: { strict?: boolean; format?: "text" | "json"; none?: boolean; exclude?: string } = {}
  ): number {
    const { strict = true, format = "text", none = true, exclude } = options;
    const app = useApplication();
    const failures: (SecretFinding & { file: string })[] = [];
    const warnings: (SecretFinding & { file: string })[] = [];
    for (const filename of files) {
      // Same report on every OS: forward slashes
      const file = (relative(app.getPath(), filename) || filename).replace(/\\/g, "/");
      // Plain JSON: the comment-preserving loader returns wrapper objects
      const findings = CryptoService.findFileSecrets(JSON.parse(JSON.stringify(FileUtils.load(filename))), exclude);
      for (const finding of findings) {
        const failure =
          finding.reason === "plain" ||
          (strict && finding.reason === "marked") ||
          (!none && finding.reason === "opted-out");
        const message = {
          plain: "secret is not encrypted",
          marked: "secret is marked encrypt: but not encrypted, run 'webda config encrypt'",
          "opted-out": "secret is kept in clear text on purpose (crypt:none:)"
        }[finding.reason];
        useLog(
          failure ? "ERROR" : "WARN",
          `${failure ? "✗" : "!"} ${file}: ${finding.path} (${finding.type}): ${message}`
        );
        const { location: _location, ...reported } = finding;
        (failure ? failures : warnings).push({ file, ...reported });
      }
    }
    if (format === "json") {
      useOutput(JSON.stringify({ findings: failures, warnings }, undefined, 2));
    } else {
      const optedOut = warnings.filter(w => w.reason === "opted-out").length;
      useOutput(
        (failures.length ? `${failures.length} unencrypted secret(s) found` : "No unencrypted secret found") +
          (optedOut ? `, ${optedOut} kept in clear text on purpose` : "")
      );
    }
    return failures.length ? 1 : 0;
  }

  /**
   * Find the unencrypted secrets of a configuration or deployment file
   *
   * A service the file overrides without its type takes the type of the application configuration, and the
   * file `parameters` are also checked against the services of the application.
   *
   * @param data - the file content, as plain JSON
   * @param exclude - secret paths to leave out, comma-separated patterns, see {@link secretPathExcluder}
   * @returns the findings, with their location in data, without the values
   */
  static findFileSecrets(data: any, exclude?: string | string[]): SecretFinding[] {
    const app = useApplication();
    const services = app.getConfiguration().services ?? {};
    const { findings, unknownTypes } = findConfigurationSecrets(
      { services: data?.services, parameters: data?.parameters, resources: data?.resources, units: data?.units },
      {
        getSchema: type => app.getSchema(type),
        // Same resolution as the services: the application namespace, then Webda
        completeNamespace: type => {
          const namespaced = app.completeNamespace(type);
          return app.getSchema(namespaced) || type.includes("/") ? namespaced : `Webda/${type}`;
        },
        getType: name => services[name]?.type,
        inheritingServices: services
      }
    );
    for (const type of unknownTypes) {
      useLog("WARN", `No schema for service type ${type}, its secrets are not checked`);
    }
    const excluded = secretPathExcluder(exclude);
    return findings.filter(finding => {
      if (!excluded(finding.path)) return true;
      useLog("DEBUG", `Secret ${finding.path} excluded`);
      return false;
    });
  }

  /**
   * Encrypt the secrets of a configuration file, keeping its comments
   *
   * The values marked `encrypt:` or `sencrypt:`, and the plain values of the secret fields, with the default
   * encrypter.
   *
   * @param file - the configuration file (json, jsonc or yaml) to update
   * @param migrate - re-encrypt the already encrypted values with this encrypter, the default one when empty
   * @param upgrade - re-encrypt the already encrypted values with their own encrypter, to its current format or key
   * @param exclude - secret paths not auto-encrypted, comma-separated patterns, see {@link secretPathExcluder}
   * @returns the number of values changed
   */
  static async encryptFile(
    file: string,
    migrate?: string,
    upgrade?: boolean,
    exclude?: string | string[]
  ): Promise<number> {
    const filename = resolve(useApplication().getPath(), file);
    const data = FileUtils.load(filename);
    const before = JSON.stringify(data);
    const settings = CryptoService.getEncryptionSettings(data);
    const plain = CryptoService.findFileSecrets(JSON.parse(before), exclude).filter(f => f.reason === "plain");
    if (plain.length && !settings.default) {
      throw new Error(
        `${plain.length} secret(s) are not encrypted in ${filename} (${plain.map(f => f.path).join(", ")}): ` +
          `set ${SETTINGS_PATH}.default or prefix them with encrypt:<encrypter>:`
      );
    }
    for (const finding of plain) {
      // The encrypter is explicit: a plain value starting with an encrypter name is not misread
      const parent = finding.location.slice(0, -1).reduce((target, segment) => target[segment], data);
      const key = finding.location[finding.location.length - 1];
      parent[key] = `encrypt:${settings.default}:${parent[key]}`;
      useLog("INFO", `Encrypting the plain secret ${finding.path}`);
    }
    let changes = 0;
    await CryptoService.encryptConfiguration(data, {
      migrate,
      upgrade,
      settings,
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
   * Generate a keys file for the `keysFile` parameter
   *
   * The keys use the default algorithms: RSA 2048 bits and a 256 bits symmetric key.
   *
   * @param out - the keys file to write
   * @returns the written file
   */
  @Command("crypto generate-keys", {
    description: "Generate a keys file for the CryptoService keysFile parameter",
    // No Core: never reads nor writes the registry
    phase: "application"
  })
  static async cryptoGenerateKeys(
    /** @description Keys file to write */
    out: string = "keys.json"
  ): Promise<string> {
    const file = resolve(getAppPath(), out);
    const params = new CryptoServiceParameters().load({});
    const { publicKey, privateKey } = generateKeyPairSync(
      // @ts-ignore
      params.asymetricType,
      params.asymetricOptions
    );
    // Same id format as the registry rotation
    const id = Math.floor(Date.now() / 1000).toString(36);
    const keys = {
      current: id,
      [`key_${id}`]: {
        publicKey,
        privateKey,
        symetric: randomBytes(params.symetricKeyLength / 8).toString("base64")
      }
    };
    try {
      writeFileSync(file, JSON.stringify(keys, undefined, 2), { mode: 0o600, flag: "wx" });
    } catch (err) {
      throw err.code === "EEXIST" ? new Error(`${file} already exists`) : err;
    }
    useLog("INFO", `Keys written to ${file}, never commit it`);
    useLog(
      "INFO",
      `Store it in the runtime, then delete the local file:\n  kubectl create secret generic webda-crypto-keys --from-file=keys.json=${file}`
    );
    return file;
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
    if (this.parameters.keysFile) {
      throw new Error(`Cannot rotate keys read from keysFile ${this.getKeysFile()}: update the file instead`);
    }
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

/**
 * Opt-out: `crypt:none:<value>` keeps a value of a secret field in clear text on purpose
 *
 * `webda config encrypt` does not encrypt it, even with `--migrate`, and `--check` reports it as a warning.
 */
CryptoService.registerEncrypter(OPT_OUT_ENCRYPTER, {
  encrypt: async (data: string) => {
    if (/[\r\n]/.test(data)) {
      throw new Error("A multi-line value cannot be kept in clear text with crypt:none:");
    }
    return data;
  },
  decrypt: async (data: string) => data,
  needsUpgrade: () => false
});

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
