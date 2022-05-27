import { createCipheriv, createDecipheriv, createHmac, generateKeyPairSync, randomBytes } from "crypto";
import * as jwt from "jsonwebtoken";
import { Inject, RegistryEntry, Store } from "..";
import { JWTOptions } from "../core";
import { JSONUtils } from "../utils/serializers";
import { DeepPartial, Service, ServiceParameters } from "./service";

export interface KeysRegistry {
  /**
   * Last time it was rotated
   */
  lastRotation: number;
  /**
   * Contains the instanceId_lastRotation of the last
   * service who rotated
   */
  rotationId: string;
  /**
   * Key storage
   */
  [keys: `key-${string}`]: {
    symetric: string;
    public: string;
    private: string;
  };
  /**
   * Current key
   */
  current: string;
}

export class CryptoServiceParameters extends ServiceParameters {
  /**
   * Number of hours a key should be used for encryption
   *
   * if auto-rotate is not set this
   */
  keyActiveLifespan: number;
  /**
   * Number of hours allowed to decrypt data encrypted with this key
   */
  keyLifespan: number;
  /**
   * Try to rotate keys when they expire
   */
  autoRotate?: number;
  /**
   * To expose JWKS
   *
   * @see https://datatracker.ietf.org/doc/html/rfc7517
   */
  expose: string;

  /**
   * Type of asymetric key
   *
   * https://nodejs.org/api/crypto.html#cryptogeneratekeypairsynctype-options
   * https://nodejs.org/docs/latest-v14.x/api/crypto.html#crypto_crypto_generatekeypairsync_type_options
   */
  asymetricType: "rsa" | "dsa" | "ec" | "ed25519" | "ed448" | "x25519" | "x448" | "dh";
  /**
   * Options for asymetric generation
   */
  asymetricOptions?: {
    /**
     * @default 2048
     */
    modulusLength?: number;
    /**
     * Only if asymetricType "ec"
     */
    namedCurve?: string;
    publicKeyEncoding?: {
      /**
       * @default spki
       */
      type?: "spki" | "pkcs1";
      format?: "pem";
    };
    privateKeyEncoding?: {
      /**
       * https://nodejs.org/docs/latest-v14.x/api/crypto.html#crypto_keyobject_export_options
       * @default pkcs8
       */
      type?: "pkcs1" | "pkcs8" | "sec1";
      format?: "pem";
      cipher?: string;
      passphrase?: string;
    };
  };
  /**
   * @default 256
   */
  symetricKeyLength?: number;
  /**
   * @default "aes-256-ctr"
   */
  symetricCipher?: string;
  /**
   * Default JWT options
   */
  jwt?: JWTOptions;

  constructor(params: any) {
    super(params);
    this.symetricKeyLength ??= 256;
    this.symetricCipher ??= "aes-256-ctr";
    this.asymetricType ??= "rsa";
    this.asymetricOptions ??= {};
    this.asymetricOptions.modulusLength ??= 2048;
    this.asymetricOptions.privateKeyEncoding ??= {};
    this.asymetricOptions.privateKeyEncoding.format ??= "pem";
    this.asymetricOptions.privateKeyEncoding.type ??= "pkcs8";
    this.asymetricOptions.publicKeyEncoding ??= {};
    this.asymetricOptions.publicKeyEncoding.format ??= "pem";
    this.asymetricOptions.publicKeyEncoding.type ??= "spki";
    this.jwt ??= {};
    this.jwt.algorithm ??= "HS256";
  }
}

interface KeysDefinition {
  publicKey: string;
  privateKey: string;
  symetric: string;
}

/**
 * @WebdaModda
 */
export default class CryptoService<T extends CryptoServiceParameters = CryptoServiceParameters> extends Service<T> {
  currentSymetricKey: string;
  currentAsymetricKey: { publicKey: string; privateKey: string };
  current: string;
  age: number;
  keys: {
    [key: string]: KeysDefinition;
  };

  @Inject("Registry")
  registry: Store<RegistryEntry>;

  /**
   * @override
   */
  loadParameters(params: DeepPartial<T>): ServiceParameters {
    return new CryptoServiceParameters(params);
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    // Load keys
    if (!(await this.load()) && this.parameters.autoRotate) {
      // Create an init version
      this.current = `init-${this.getWebda().getInstanceId()}`;
      await this.registry.put("keys", { current: this.current });
      // Try to create keys as they do not exist
      await this.rotate();
    }
    return this;
  }

  async load(): Promise<boolean> {
    let load = await this.registry.get("keys");
    if (!load) {
      return false;
    }
    this.keys = {};
    Object.keys(load)
      .filter(k => k.startsWith("key_"))
      .forEach(k => {
        this.keys[k.substring(4)] = load[k];
      });
    this.current = load.current.startsWith("init-") ? undefined : load.current;
    this.age = parseInt(this.current, 16);
    return true;
  }

  /**
   * Generate asymetric key
   * @returns
   */
  generateAsymetricKeys(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = generateKeyPairSync(
      // @ts-ignore
      this.parameters.asymetricType,
      this.parameters.asymetricOptions
    );
    return { publicKey, privateKey };
  }

  /**
   * Generate symetric key
   * @returns
   */
  generateSymetricKey(): string {
    return randomBytes(this.parameters.symetricKeyLength / 8).toString("base64");
  }

  /**
   * Return current key set
   */
  async getCurrentKeys(): Promise<{ id: string; keys: KeysDefinition }> {
    if (!this.keys || !this.current || !this.keys[this.current]) {
      throw new Error("CryptoService not initialized");
    }
    return { keys: this.keys[this.current], id: this.current };
  }

  /**
   * Retrieve a HMAC for a string
   * @param data
   * @returns
   */
  public async hmac(data: string | any): Promise<string> {
    if (typeof data !== "string") {
      data = JSONUtils.stringify(data);
    }
    let key = await this.getCurrentKeys();
    return key.id + createHmac("sha256", key.keys.symetric).update(data).digest("hex");
  }

  /**
   * Verify a HMAC for a string
   * @param data
   * @returns
   */
  public async hmacVerify(data: string | any, hmac: string): Promise<boolean> {
    if (typeof data !== "string") {
      data = JSONUtils.stringify(data);
    }
    let keyId = hmac.substring(0, 8);
    if (!(await this.checkKey(keyId))) {
      return false;
    }
    return createHmac("sha256", this.keys[keyId].symetric).update(data).digest("hex") === hmac.substring(8);
  }

  /**
   * JWT token generation
   */
  public async jwtSign(data: any, options?: JWTOptions): Promise<string> {
    let res = { ...this.parameters.jwt, ...options };
    let key = res.secretOrPublicKey;
    // Default to our current private key
    if (!res.secretOrPublicKey) {
      let keyInfo = await this.getCurrentKeys();
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
   * @param keyId
   * @returns
   */
  async checkKey(keyId: string): Promise<boolean> {
    if (!this.keys[keyId]) {
      // Key is more recent than current one so try to reload
      if (parseInt(keyId, 16) > this.age) {
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
   */
  public async getJWTKey(header, callback) {
    if (!header.kid) {
      callback(new Error("Unknown key"));
      return;
    }
    let keyId = header.kid.substring(1);
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
   */
  public async jwtVerify(token: string, options?: JWTOptions): Promise<string | any> {
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
   */
  public async encrypt(data: any): Promise<string> {
    let key = await this.getCurrentKeys();
    // Initialization Vector
    let iv = randomBytes(16);
    let cipher = createCipheriv(this.parameters.symetricCipher, Buffer.from(key.keys.symetric, "base64"), iv);
    let encrypted = Buffer.concat([iv, cipher.update(Buffer.from(JSON.stringify(data))), cipher.final()]).toString(
      "base64"
    );
    return this.jwtSign(encrypted, { keyid: `S${key.id}`, secretOrPublicKey: key.keys.symetric });
  }

  /**
   * Parse the JWT header section
   */
  getJWTHeader(token: string) {
    return JSON.parse(Buffer.from(token.split(".")[0], "base64").toString());
  }

  /**
   * Decrypt data
   */
  public async decrypt(token: string): Promise<any> {
    let input = Buffer.from(await this.jwtVerify(token), "base64");
    let header = this.getJWTHeader(token);
    let iv = input.slice(0, 16);
    let decipher = createDecipheriv(
      this.parameters.symetricCipher,
      Buffer.from(this.keys[header.kid.substring(1)].symetric, "base64"),
      iv
    );
    return JSON.parse(decipher.update(input.slice(16)).toString() + decipher.final().toString());
  }

  /**
   * Get next id
   */
  getNextId(): { id: string; age: number } {
    // Should be good for years as 8char
    let age = Math.floor(Date.now() / 1000);
    return { age, id: age.toString(16) };
  }

  /**
   * Rotate keys
   */
  async rotate() {
    const { age, id } = this.getNextId();
    let next: any = {
      current: id,
      [`key_${id}`]: {
        ...this.generateAsymetricKeys(),
        symetric: this.generateSymetricKey()
      }
    };
    if (await this.registry.conditionalPatch("keys", next, "current", this.current)) {
      this.keys ??= {};
      this.keys[id] = next[`key_${id}`];
      this.current = id;
      this.age = age;
    } else {
      // Reload as something else has modified
      await this.load();
    }
  }
}

export { CryptoService };
