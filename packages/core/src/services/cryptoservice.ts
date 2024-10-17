import { createCipheriv, createDecipheriv, createHash, createHmac, generateKeyPairSync, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { pem2jwk } from "pem-jwk";
import * as util from "util";
import { JSONUtils } from "@webda/utils";

import { CryptoServiceParameters, JWTOptions, KeysDefinition } from "./icryptoservice";
import { getMachineId, useCore, useService } from "../core/hooks";
import { useLog } from "../loggers/hooks";
import { Service } from "./service";
import { DeepPartial } from "@webda/tsc-esm";
import { ServiceParameters } from "../interfaces";
import { OperationContext } from "../contexts/operationcontext";
import { Route } from "../rest/irest";
import { useRegistry } from "../models/registry";

export class SecretString {
  constructor(
    protected str: string,
    protected encrypter: string
  ) {}

  static from(value: string | SecretString, path?: string): string {
    if (value instanceof SecretString) {
      return value.getValue();
    }
    useLog("WARN", "A secret string is not encrypted", value);

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
 * @WebdaModda
 */
export class CryptoService<T extends CryptoServiceParameters = CryptoServiceParameters>
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
      n: string;
      e: string;
    };
  } = {};

  /**
   * @override
   */
  loadParameters(params: DeepPartial<T>): T {
    return <T>new CryptoServiceParameters().load(params);
  }

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
   */
  async load(): Promise<boolean> {
    const load = await useRegistry().get<KeysRegistry>("keys");
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
    const key = keyId ? { id: keyId, keys: this.keys[keyId] } : await this.getCurrentKeys();
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
    const [keyId, mac] = hmac.split(".");
    if (!(await this.checkKey(keyId))) {
      return false;
    }
    return createHmac("sha256", this.keys[keyId].symetric).update(data).digest("hex") === mac;
  }

  /**
   * JWT token generation
   */
  public async jwtSign(data: any, options?: JWTOptions): Promise<string> {
    const res = { ...this.parameters.jwt, ...options };
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
    const key = await this.getCurrentKeys();
    // Initialization Vector
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.parameters.symetricCipher, Buffer.from(key.keys.symetric, "base64"), iv);
    const encrypted = Buffer.concat([iv, cipher.update(Buffer.from(JSON.stringify(data))), cipher.final()]).toString(
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
      for (const i in data) {
        data[i] = await CryptoService.encryptConfiguration(data[i]);
      }
    } else if (typeof data === "string") {
      if (data.startsWith("encrypt:") || data.startsWith("sencrypt:")) {
        let str = data.substring(data.indexOf(":") + 1);
        const type = str.substring(0, str.indexOf(":"));
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
      for (const i in data) {
        data[i] = await CryptoService.decryptConfiguration(data[i]);
      }
    } else if (typeof data === "string") {
      if (data.startsWith("crypt:") || data.startsWith("scrypt:")) {
        let str = data.substring(data.indexOf(":") + 1);
        const type = str.substring(0, str.indexOf(":"));
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
    const input = Buffer.from(await this.jwtVerify(token), "base64");
    const header = this.getJWTHeader(token);
    const iv = input.subarray(0, 16);
    const decipher = createDecipheriv(
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
    const age = Math.floor(Date.now() / 1000);
    return { age, id: age.toString(36) };
  }

  /**
   * Rotate keys
   */
  async rotate() {
    const { age, id } = this.getNextId();
    const next: KeysRegistry = {
      current: id,
      rotationInstance: useCore().getInstanceId()
    };
    next[`key_${id}`] = {
      ...this.generateAsymetricKeys(),
      symetric: this.generateSymetricKey()
    };
    if (!(await useRegistry().exists("keys"))) {
      this.current = `init-${useCore().getInstanceId()}`;
      await useRegistry().put("keys", { current: this.current });
    }
    try {
      await useRegistry().patch("keys", next, "current", this.current);
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
 * Encrypt data with local machine id
 */
CryptoService.registerEncrypter("local", {
  encrypt: async (data: string) => {
    // Initialization Vector
    const iv = randomBytes(16);
    const key = createHash("sha256").update(getMachineId()).digest();
    const cipher = createCipheriv("aes-256-ctr", key, iv);
    return Buffer.concat([iv, cipher.update(Buffer.from(data)), cipher.final()]).toString("base64");
  },
  decrypt: async (data: string) => {
    const input = Buffer.from(data, "base64");
    const iv = input.subarray(0, 16);
    const key = createHash("sha256").update(getMachineId()).digest();
    const decipher = createDecipheriv("aes-256-ctr", key, iv);
    return decipher.update(input.subarray(16)).toString() + decipher.final().toString();
  }
});

export default CryptoService;

/**
 * Return the CryptoService
 *
 * As it is a service, it can be used with the useService hook
 *
 * @returns
 */
export function useCrypto() {
  return useService<CryptoService>("CryptoService");
}
