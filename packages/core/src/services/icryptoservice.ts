import { ServiceParameters } from "../interfaces";

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
  declare url?: string;

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

  default() {
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

export interface KeysDefinition {
  publicKey: string;
  privateKey: string;
  symetric: string;
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
