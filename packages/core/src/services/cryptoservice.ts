import { DeepPartial } from "@webda/tsc-esm";
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
import { Core, OperationContext, RegistryEntry, Store } from "../index";
import { JSONUtils } from "../utils/serializers";
import { Inject, Route, Service, ServiceParameters } from "./service";

export class SecretString {
  constructor(
    protected str: string,
    protected encrypter: string
  ) {}

  static from(value: string | SecretString, path?: string): string {
    if (value instanceof SecretString) {
      return value.getValue();
    }
    if (Core.get()) {
      Core.get()?.log("WARN", "A secret string is not encrypted", value);
    } else {
      console.error("WARN", "A secret string is not encrypted");
    }

    return value;
  }

  getValue(): string {
    return this.str;
  }
  toString(): string {
    return "********";
  }
  [util.inspect.custom](depth, options, inspect) {
    return "********";
  }
}

export interface KeysRegistry {
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
}

/**
 * Encrypt/Decrypt string
 */
export interface StringEncrypter {
  /**
   * Encrypt a string
   * @param data
   * @returns
   */
  encrypt(data: string, options?: any): Promise<string>;
  /**
   * Decrypt a string
   * @param data
   * @returns
   */
  decrypt(data: string, options?: any): Promise<string>;
}

/**
 * JWT Options
 */
export interface JWTOptions {
  /**
   * Secret to use with JWT
   */
  secretOrPublicKey?: string | Buffer | { key: string; passphrase: string };
  /**
   * Algorithm for JWT token
   *
   * @see https://www.npmjs.com/package/jsonwebtoken
   * @default "HS256"
   */
  algorithm?:
    | "HS256"
    | "HS384"
    | "HS512"
    | "RS256"
    | "RS384"
    | "RS512"
    | "PS256"
    | "PS384"
    | "PS512"
    | "ES256"
    | "ES384"
    | "ES512";

  /**
   * expressed in seconds or a string describing a time span zeit/ms.
   *
   * Eg: 60, "2 days", "10h", "7d". A numeric value is interpreted as a seconds count. If you use a string be sure you provide the time units (days, hours, etc), otherwise milliseconds unit is used by default ("120" is equal to "120ms").
   */
  expiresIn?: number | string;
  /**
   * Audience for the jwt
   */
  audience?: string;
  /**
   * Issuer of the token
   */
  issuer?: string;
  /**
   * Subject for JWT
   */
  subject?: string;
  keyid?: any;
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
   * Try to rotate keys when they expire in days
   */
  autoRotate?: number;
  /**
   * Create first set of key if does not exist
   */
  autoCreate?: boolean;
  /**
   * To expose JWKS
   *
   * @see https://datatracker.ietf.org/doc/html/rfc7517
   */
  url?: string;

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
export default class CryptoService<T extends CryptoServiceParameters = CryptoServiceParameters>
  extends Service<T>
  implements StringEncrypter
{
  private static encrypters: { [key: string]: StringEncrypter } = {};

  /**
   * Register an encrypter for configuration
   * @param name
   * @param encrypter
   */
  static registerEncrypter(
    name: string,
    encrypter: { encrypt: (data: string) => Promise<string>; decrypt: (data: string) => Promise<string> }
  ) {
    if (CryptoService.encrypters[name]) {
      console.error("Encrypter", name, "already registered");
    }
    CryptoService.encrypters[name] = encrypter;
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
      n?: string;
      e?: string;
    };
  } = {};

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
    CryptoService.encrypters["self"] = this;
    // Load keys
    if (!(await this.load()) && this.parameters.autoCreate) {
      await this.rotate();
    }
    return this;
  }

  /**
   *
   */
  @Route(".", ["GET"], {
    description: "Serve JWKS keys",
    get: {
      operationId: "getJWKS"
    }
  })
  async serveJWKS(
    context: OperationContext<
      void,
      {
        /**
         * Keys in JWKS format
         *
         * https://datatracker.ietf.org/doc/html/rfc7517
         */
        keys: {
          /**
           * The "kty" (key type) parameter identifies the cryptographic algorithm
           * family used with the key, such as "RSA" or "EC".  "kty" values should
           * either be registered in the IANA "JSON Web Key Types" registry
           * established by [JWA] or be a value that contains a Collision-
           * Resistant Name.  The "kty" value is a case-sensitive string.  This
           * member MUST be present in a JWK.
           *
           * https://datatracker.ietf.org/doc/html/rfc7517#section-4.1
           */
          kty: string;
          /**
           * The "kid" (key ID) parameter is used to match a specific key.  This
           * is used, for instance, to choose among a set of keys within a JWK Set
           * during key rollover.  The structure of the "kid" value is
           * unspecified.  When "kid" values are used within a JWK Set, different
           * keys within the JWK Set SHOULD use distinct "kid" values.  (One
           * example in which different keys might use the same "kid" value is if
           * they have different "kty" (key type) values but are considered to be
           * equivalent alternatives by the application using them.)  The "kid"
           * value is a case-sensitive string.  Use of this member is OPTIONAL.
           * When used with JWS or JWE, the "kid" value is used to match a JWS or
           * JWE "kid" Header Parameter value.
           *
           * https://datatracker.ietf.org/doc/html/rfc7517#section-4.5
           */
          kid: string;
          n: string;
          e: string;
        }[];
      }
    >
  ) {
    context.write({
      keys: Object.keys(this.keys).map(k => {
        if (!this.jwks[k]) {
          /*
            when Node >= 16
            this.jwks[k] = createPublicKey(this.keys[k].publicKey).export({ format: "jwk" });
            and remove pem-jwk
            */
          this.jwks[k] = createPublicKey(this.keys[k].publicKey).export({ format: "jwk" });
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
   */
  async load(): Promise<boolean> {
    let load = <KeysRegistry>(<unknown>await this.registry.get("keys"));
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
    this.age = parseInt(this.current, 36);
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
   * @param keyId to use
   * @returns
   */
  public async hmac(data: string | any, keyId?: string): Promise<string> {
    if (typeof data !== "string") {
      data = JSONUtils.stringify(data);
    }
    let key = keyId ? { id: keyId, keys: this.keys[keyId] } : await this.getCurrentKeys();
    return key.id + "." + createHmac("sha256", key.keys.symetric).update(data).digest("hex");
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
    let [keyId, mac] = hmac.split(".");
    if (!(await this.checkKey(keyId))) {
      return false;
    }
    return createHmac("sha256", this.keys[keyId].symetric).update(data).digest("hex") === mac;
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
    return this.jwtSign(encrypted, {
      keyid: `S${key.id}`,
      secretOrPublicKey: key.keys.symetric
    });
  }

  /**
   * Parse the JWT header section
   */
  getJWTHeader(token: string) {
    return JSON.parse(Buffer.from(token.split(".")[0], "base64").toString());
  }

  /**
   * Encrypt configuration
   * @param data
   */
  public static async encryptConfiguration(data: any) {
    if (data instanceof Object) {
      for (let i in data) {
        data[i] = await CryptoService.encryptConfiguration(data[i]);
      }
    } else if (typeof data === "string") {
      if (data.startsWith("encrypt:") || data.startsWith("sencrypt:")) {
        let str = data.substring(data.indexOf(":") + 1);
        let type = str.substring(0, str.indexOf(":"));
        str = str.substring(str.indexOf(":") + 1);
        if (!CryptoService.encrypters[type]) {
          throw new Error("Unknown encrypter " + type);
        }
        if (data.startsWith("s")) {
          data = `scrypt:${type}:` + (await CryptoService.encrypters[type].encrypt(str));
        } else {
          data = `crypt:${type}:` + (await CryptoService.encrypters[type].encrypt(str));
        }
      }
    }
    return data;
  }

  /**
   *
   * @param data
   */
  public static async decryptConfiguration(data: any): Promise<any> {
    if (data instanceof Object) {
      for (let i in data) {
        data[i] = await CryptoService.decryptConfiguration(data[i]);
      }
    } else if (typeof data === "string") {
      if (data.startsWith("crypt:") || data.startsWith("scrypt:")) {
        let str = data.substring(data.indexOf(":") + 1);
        let type = str.substring(0, str.indexOf(":"));
        str = str.substring(str.indexOf(":") + 1);
        if (!CryptoService.encrypters[type]) {
          throw new Error("Unknown encrypter " + type);
        }
        // We keep the ability to map to a simple string for incompatible module
        if (data.startsWith("scrypt:")) {
          return await CryptoService.encrypters[type].decrypt(str);
        } else {
          return new SecretString(await CryptoService.encrypters[type].decrypt(str), type);
        }
      }
    }
    return data;
  }

  /**
   * Decrypt data
   */
  public async decrypt(token: string): Promise<any> {
    let input = Buffer.from(await this.jwtVerify(token), "base64");
    let header = this.getJWTHeader(token);
    let iv = input.subarray(0, 16);
    let decipher = createDecipheriv(
      this.parameters.symetricCipher,
      Buffer.from(this.keys[header.kid.substring(1)].symetric, "base64"),
      iv
    );
    return JSON.parse(decipher.update(input.subarray(16)).toString() + decipher.final().toString());
  }

  /**
   * Get next id
   */
  getNextId(): { id: string; age: number } {
    // Should be good for years as 8char
    let age = Math.floor(Date.now() / 1000);
    return { age, id: age.toString(36) };
  }

  /**
   * Rotate keys
   */
  async rotate() {
    const { age, id } = this.getNextId();
    let next: KeysRegistry = {
      current: id,
      rotationInstance: this.getWebda().getInstanceId()
    };
    next[`key_${id}`] = {
      ...this.generateAsymetricKeys(),
      symetric: this.generateSymetricKey()
    };
    if (!(await this.registry.exists("keys"))) {
      this.current = `init-${this.getWebda().getInstanceId()}`;
      await this.registry.put("keys", { current: this.current });
    }
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

/**
 * Encrypt data with local machine id
 */
CryptoService.registerEncrypter("local", {
  encrypt: async (data: string) => {
    // Initialization Vector
    let iv = randomBytes(16);
    const key = createHash("sha256").update(Core.getMachineId()).digest();
    let cipher = createCipheriv("aes-256-ctr", key, iv);
    return Buffer.concat([iv, cipher.update(Buffer.from(data)), cipher.final()]).toString("base64");
  },
  decrypt: async (data: string) => {
    let input = Buffer.from(data, "base64");
    let iv = input.subarray(0, 16);
    const key = createHash("sha256").update(Core.getMachineId()).digest();
    let decipher = createDecipheriv("aes-256-ctr", key, iv);
    return decipher.update(input.subarray(16)).toString() + decipher.final().toString();
  }
});

export { CryptoService };
