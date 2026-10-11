import {
  constants,
  createPrivateKey,
  createPublicKey,
  KeyObject,
  privateDecrypt,
  publicEncrypt,
  randomBytes
} from "crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { AuthenticatedEncryption } from "./authenticatedencryption.js";
import type { EncrypterContext, StringEncrypter } from "./cryptoservice.service.js";

/**
 * Options of the `pki` encrypter, in `parameters.configurationEncryption.encrypters.pki`
 */
export interface PkiEncrypterOptions {
  /**
   * Key id used to encrypt new values
   *
   * Its public key must be available: `<publicKeys>/<activeKey>.pub.pem`
   */
  activeKey?: string;
  /**
   * Directory of the public keys, relative to the application: `<kid>.pub.pem`
   *
   * Commit it with the application, any developer or CI job can then encrypt a value.
   *
   * @default ".webda/keys"
   */
  publicKeys?: string;
  /**
   * Directory of the private keys at runtime, a Kubernetes Secret mount for example: `<kid>.pem` or `<kid>`
   *
   * @default env WEBDA_PKI_PRIVATE_KEYS_DIR, then "/etc/webda/pki"
   */
  privateKeys?: string;
}

/**
 * Version of the `pki` encrypted format
 */
export const PKI_FORMAT_V1 = "v1";
/**
 * Default directory of the public keys, relative to the application
 */
export const PKI_DEFAULT_PUBLIC_KEYS = ".webda/keys";
/**
 * Default directory of the private keys
 */
export const PKI_DEFAULT_PRIVATE_KEYS = "/etc/webda/pki";
/**
 * Environment variable overriding the private keys directory
 */
export const PKI_PRIVATE_KEYS_DIR_ENV = "WEBDA_PKI_PRIVATE_KEYS_DIR";
/**
 * Environment variable prefix holding one private key PEM: `WEBDA_PKI_PRIVATE_KEY_<KID>`
 */
export const PKI_PRIVATE_KEY_ENV_PREFIX = "WEBDA_PKI_PRIVATE_KEY_";
/**
 * Environment variable holding the passphrase of the private keys
 */
export const PKI_PASSPHRASE_ENV = "WEBDA_PKI_PASSPHRASE";
/**
 * Minimum RSA modulus length
 */
export const PKI_MIN_BITS = 3072;
/**
 * Valid key id
 */
const KID = /^[A-Za-z0-9_.-]+$/;

/**
 * Check a key id
 * @param kid - the key id
 * @returns the key id
 */
export function checkKid(kid: string): string {
  if (typeof kid !== "string" || !KID.test(kid)) {
    throw new Error(`Invalid key id '${kid}', use letters, digits, '_', '-' and '.' only`);
  }
  return kid;
}

/**
 * Name of the environment variable holding the private key of a kid
 * @param kid - the key id
 * @returns the variable name
 */
export function getPrivateKeyEnv(kid: string): string {
  return PKI_PRIVATE_KEY_ENV_PREFIX + kid.toUpperCase().replace(/[-.]/g, "_");
}

/**
 * Check that a key can be used by the `pki` encrypter
 * @param key - the key
 * @param kid - the key id, for the message
 * @returns the key
 */
function checkKey(key: KeyObject, kid: string): KeyObject {
  if (key.asymmetricKeyType !== "rsa") {
    throw new Error(`Key '${kid}' is not an RSA key (${key.asymmetricKeyType})`);
  }
  if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < PKI_MIN_BITS) {
    throw new Error(`Key '${kid}' is too small, RSA ${PKI_MIN_BITS} bits at least is required`);
  }
  return key;
}

/**
 * Parsed `pki` encrypted value
 */
export interface PkiValue {
  kid: string;
  wrappedKey: string;
  ciphertext: string;
}

/**
 * Parse a `v1:<kid>:<wrappedKey>:<ciphertext>` value
 * @param data - the encrypted value, without `crypt:pki:`
 * @returns the parts
 */
export function parsePkiValue(data: string): PkiValue {
  const parts = typeof data === "string" ? data.split(":") : [];
  if (parts.length !== 4 || parts[0] !== PKI_FORMAT_V1 || !KID.test(parts[1])) {
    throw new Error("Invalid pki encrypted data");
  }
  return { kid: parts[1], wrappedKey: parts[2], ciphertext: parts[3] };
}

/**
 * Public and private keys of the `pki` encrypter
 *
 * The keys are loaded lazily and cached by kid.
 */
export class PkiKeyring {
  /**
   * Key id used to encrypt
   */
  readonly activeKey?: string;
  /**
   * Absolute directory of the public keys
   */
  readonly publicKeysDir: string;
  /**
   * Absolute directory of the private keys
   */
  readonly privateKeysDir: string;
  protected publicKeys = new Map<string, KeyObject>();
  protected privateKeys = new Map<string, KeyObject>();

  /**
   * @param options - the encrypter options
   * @param appPath - the application path, relative directories resolve against it
   */
  constructor(options: PkiEncrypterOptions = {}, appPath: string = process.cwd()) {
    if (options.activeKey !== undefined) {
      this.activeKey = checkKid(options.activeKey);
    }
    this.publicKeysDir = resolve(appPath, options.publicKeys ?? PKI_DEFAULT_PUBLIC_KEYS);
    this.privateKeysDir = resolve(
      appPath,
      options.privateKeys ?? process.env[PKI_PRIVATE_KEYS_DIR_ENV] ?? PKI_DEFAULT_PRIVATE_KEYS
    );
  }

  /**
   * List the kids of a directory
   * @param dir - the directory
   * @param suffix - the file suffix
   * @param optionalSuffix - also accept files without the suffix
   * @returns the sorted kids
   */
  protected static listDir(dir: string, suffix: string, optionalSuffix: boolean): string[] {
    if (!existsSync(dir)) {
      return [];
    }
    const kids = new Set<string>();
    for (const file of readdirSync(dir)) {
      // Kubernetes Secret mounts hold `..data` and `..<timestamp>` entries
      if (file.startsWith(".") || !statSync(join(dir, file)).isFile()) {
        continue;
      }
      let kid: string;
      if (file.endsWith(suffix)) {
        kid = file.substring(0, file.length - suffix.length);
      } else if (optionalSuffix && !file.includes(".pem")) {
        kid = file;
      }
      if (kid && KID.test(kid)) {
        kids.add(kid);
      }
    }
    return [...kids].sort();
  }

  /**
   * List the kids having a public key
   * @returns the kids
   */
  listKids(): string[] {
    return PkiKeyring.listDir(this.publicKeysDir, ".pub.pem", false);
  }

  /**
   * List the kids having a private key file
   * @returns the kids
   */
  listPrivateKids(): string[] {
    return PkiKeyring.listDir(this.privateKeysDir, ".pem", true);
  }

  /**
   * Get the public key of a kid
   *
   * From `<publicKeys>/<kid>.pub.pem`, or derived from its private key when it is available
   *
   * @param kid - the key id
   * @returns the public key
   */
  getPublicKey(kid: string): KeyObject {
    checkKid(kid);
    if (!this.publicKeys.has(kid)) {
      const file = join(this.publicKeysDir, `${kid}.pub.pem`);
      let key: KeyObject;
      if (existsSync(file)) {
        try {
          key = createPublicKey(readFileSync(file));
        } catch (err) {
          throw new Error(`Cannot load public key '${kid}' from ${file}: ${err.message}`);
        }
      } else if (this.hasPrivateKey(kid)) {
        key = createPublicKey(this.getPrivateKey(kid));
      } else {
        throw new Error(`No public key for active key '${kid}' in ${this.publicKeysDir}`);
      }
      this.publicKeys.set(kid, checkKey(key, kid));
    }
    return this.publicKeys.get(kid);
  }

  /**
   * Find the source of a private key
   * @param kid - the key id
   * @returns the environment variable or file name, undefined if not found
   */
  protected findPrivateKey(kid: string): { env?: string; file?: string } | undefined {
    const env = getPrivateKeyEnv(kid);
    if (process.env[env]) {
      return { env };
    }
    for (const file of [join(this.privateKeysDir, `${kid}.pem`), join(this.privateKeysDir, kid)]) {
      if (existsSync(file) && statSync(file).isFile()) {
        return { file };
      }
    }
    return undefined;
  }

  /**
   * Check if the private key of a kid is available
   * @param kid - the key id
   * @returns true if available
   */
  hasPrivateKey(kid: string): boolean {
    return this.privateKeys.has(kid) || this.findPrivateKey(kid) !== undefined;
  }

  /**
   * Get the private key of a kid
   *
   * From `WEBDA_PKI_PRIVATE_KEY_<KID>`, then `<privateKeys>/<kid>.pem` or `<privateKeys>/<kid>`.
   * The passphrase, if any, is read from `WEBDA_PKI_PASSPHRASE`.
   *
   * @param kid - the key id
   * @returns the private key
   */
  getPrivateKey(kid: string): KeyObject {
    checkKid(kid);
    if (!this.privateKeys.has(kid)) {
      const source = this.findPrivateKey(kid);
      if (!source) {
        const available = this.listPrivateKids();
        throw new Error(
          `No private key for kid '${kid}' (available: ${available.length ? available.join(", ") : "none"} in ${this.privateKeysDir})`
        );
      }
      const origin = source.env ?? source.file;
      let key: KeyObject;
      try {
        key = createPrivateKey({
          key: source.env ? process.env[source.env] : readFileSync(source.file),
          passphrase: process.env[PKI_PASSPHRASE_ENV]
        });
      } catch (err) {
        // The error never contains the key material
        throw new Error(`Cannot load private key '${kid}' from ${origin}: ${err.message}`);
      }
      this.privateKeys.set(kid, checkKey(key, kid));
    }
    return this.privateKeys.get(kid);
  }
}

/**
 * Asymmetric encrypter: hybrid RSA-OAEP-256 + AES-256-GCM
 *
 * The public keys are committed with the application, so anyone can encrypt a value. The private keys only live
 * in the runtime (a Kubernetes Secret mount or environment variables), so only the application can decrypt.
 *
 * Format: `v1:<kid>:<base64(wrappedKey)>:<base64(iv | tag | ciphertext)>`, the kid is authenticated.
 */
export class PkiEncrypter implements StringEncrypter {
  protected keyring: PkiKeyring;
  /**
   * Serialized configuration of the keyring, to keep its cache when unchanged
   */
  protected configuration: string;

  /**
   * Configure the keyring
   * @param options - the encrypter options
   * @param context - the encryption context
   */
  configure(options: PkiEncrypterOptions = {}, context?: EncrypterContext): void {
    const appPath = context?.appPath ?? process.cwd();
    const configuration = JSON.stringify([options, appPath, process.env[PKI_PRIVATE_KEYS_DIR_ENV]]);
    if (this.keyring && configuration === this.configuration) {
      return;
    }
    this.keyring = new PkiKeyring(options, appPath);
    this.configuration = configuration;
  }

  /**
   * Get the keyring, with the default options when not configured
   * @returns the keyring
   */
  getKeyring(): PkiKeyring {
    if (!this.keyring) {
      this.configure();
    }
    return this.keyring;
  }

  /**
   * Additional authenticated data binding the format and the kid
   * @param kid - the key id
   * @returns the AAD
   */
  protected static aad(kid: string): Uint8Array {
    return new Uint8Array(Buffer.from(`${PKI_FORMAT_V1}:${kid}`));
  }

  /**
   * Encrypt with the public key of the active key
   * @param data - the plain value
   * @returns the encrypted value
   */
  async encrypt(data: string): Promise<string> {
    const keyring = this.getKeyring();
    const kid = keyring.activeKey;
    if (!kid) {
      throw new Error("No active key, set parameters.configurationEncryption.encrypters.pki.activeKey");
    }
    const publicKey = keyring.getPublicKey(kid);
    const dataKey = new Uint8Array(randomBytes(32));
    const ciphertext = AuthenticatedEncryption.encrypt(dataKey, data, PkiEncrypter.aad(kid));
    const wrappedKey = publicEncrypt(
      { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      dataKey
    ).toString("base64");
    return `${PKI_FORMAT_V1}:${kid}:${wrappedKey}:${ciphertext}`;
  }

  /**
   * Decrypt with the private key of the value kid
   * @param data - the encrypted value
   * @returns the plain value
   */
  async decrypt(data: string): Promise<string> {
    const { kid, wrappedKey, ciphertext } = parsePkiValue(data);
    const privateKey = this.getKeyring().getPrivateKey(kid);
    let dataKey: Uint8Array;
    try {
      dataKey = new Uint8Array(
        privateDecrypt(
          { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
          new Uint8Array(Buffer.from(wrappedKey, "base64"))
        )
      );
    } catch {
      throw new Error("Wrong key or altered data");
    }
    if (dataKey.length !== 32) {
      throw new Error("Wrong key or altered data");
    }
    return AuthenticatedEncryption.decrypt(dataKey, ciphertext, PkiEncrypter.aad(kid));
  }

  /**
   * A value needs an upgrade when it was not encrypted with the active key
   * @param data - the encrypted value
   * @returns true to re-encrypt it
   */
  needsUpgrade(data: string): boolean {
    const activeKey = this.getKeyring().activeKey;
    try {
      return activeKey !== undefined && parsePkiValue(data).kid !== activeKey;
    } catch {
      return true;
    }
  }
}

/**
 * The `pki` encrypter instance, registered by CryptoService
 */
export const pkiEncrypter = new PkiEncrypter();
