import * as util from "util";
import { CryptoServiceParameters, JWTOptions, KeysDefinition } from "./icryptoservice.js";
import { Service } from "./service.js";
import { OperationContext } from "../contexts/operationcontext.js";
export declare class SecretString {
    protected str: string;
    protected encrypter: string;
    constructor(str: string, encrypter: string);
    static from(value: string | SecretString, path?: string): string;
    getValue(): string;
    toString(): string;
    [util.inspect.custom](depth: any, options: any, inspect: any): string;
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
export declare class CryptoService<T extends CryptoServiceParameters = CryptoServiceParameters> extends Service<T> implements StringEncrypter {
    private static encrypters;
    /**
     * Register an encrypter for configuration
     * @param name
     * @param encrypter
     */
    static registerEncrypter(name: string, encrypter: {
        encrypt: (data: string) => Promise<string>;
        decrypt: (data: string) => Promise<string>;
    }): void;
    currentSymetricKey: string;
    currentAsymetricKey: {
        publicKey: string;
        privateKey: string;
    };
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
    };
    /**
     * @override
     */
    init(): Promise<this>;
    /**
     *
     */
    serveJWKS(context: OperationContext): Promise<void>;
    /**
     * Load keys from registry
     */
    load(): Promise<boolean>;
    /**
     * Generate asymetric key
     * @returns
     */
    generateAsymetricKeys(): {
        publicKey: string;
        privateKey: string;
    };
    /**
     * Generate symetric key
     * @returns
     */
    generateSymetricKey(): string;
    /**
     * Return current key set
     */
    getCurrentKeys(): Promise<{
        id: string;
        keys: KeysDefinition;
    }>;
    /**
     * Retrieve a HMAC for a string
     * @param data
     * @param keyId to use
     * @returns
     */
    hmac(data: string | any, keyId?: string): Promise<string>;
    /**
     * Verify a HMAC for a string
     * @param data
     * @returns
     */
    hmacVerify(data: string | any, hmac: string): Promise<boolean>;
    /**
     * JWT token generation
     */
    jwtSign(data: any, options?: JWTOptions): Promise<string>;
    /**
     *
     * @param keyId
     * @returns
     */
    checkKey(keyId: string): Promise<boolean>;
    /**
     * Get JWT key based on kid
     */
    getJWTKey(header: any, callback: any): Promise<void>;
    /**
     * JWT token verification
     */
    jwtVerify(token: string, options?: JWTOptions): Promise<string | any>;
    /**
     * Encrypt data
     */
    encrypt(data: any): Promise<string>;
    /**
     * Parse the JWT header section
     */
    getJWTHeader(token: string): any;
    /**
     * Encrypt configuration
     * @param data
     */
    static encryptConfiguration(data: any): Promise<any>;
    /**
     *
     * @param data
     */
    static decryptConfiguration(data: any): Promise<any>;
    /**
     * Decrypt data
     */
    decrypt(token: string): Promise<any>;
    /**
     * Get next id
     */
    getNextId(): {
        id: string;
        age: number;
    };
    /**
     * Rotate keys
     */
    rotate(): Promise<void>;
}
export default CryptoService;
/**
 * Return the CryptoService
 *
 * As it is a service, it can be used with the useService hook
 *
 * @returns
 */
export declare function useCrypto(): CryptoService<CryptoServiceParameters>;
//# sourceMappingURL=cryptoservice.d.ts.map