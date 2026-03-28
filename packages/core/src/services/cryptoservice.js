var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { createCipheriv, createDecipheriv, createHash, createHmac, generateKeyPairSync, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { pem2jwk } from "pem-jwk";
import * as util from "util";
import { JSONUtils } from "@webda/utils";
import { getMachineId, useCore, useService } from "../core/hooks.js";
import { useLog } from "../loggers/hooks.js";
import { Service } from "./service.js";
import { Route } from "../rest/irest.js";
import { useRegistry } from "../models/registry.js";
export class SecretString {
    constructor(str, encrypter) {
        this.str = str;
        this.encrypter = encrypter;
    }
    static from(value, path) {
        if (value instanceof SecretString) {
            return value.getValue();
        }
        useLog("WARN", "A secret string is not encrypted", value);
        return value;
    }
    getValue() {
        return this.str;
    }
    toString() {
        return "********";
    }
    [util.inspect.custom](depth, options, inspect) {
        return "********";
    }
}
/**
 * @WebdaModda
 */
let CryptoService = (() => {
    var _a;
    let _classSuper = Service;
    let _instanceExtraInitializers = [];
    let _serveJWKS_decorators;
    return _a = class CryptoService extends _classSuper {
            constructor() {
                super(...arguments);
                this.currentSymetricKey = __runInitializers(this, _instanceExtraInitializers);
                /**
                 * JWKS cache
                 */
                this.jwks = {};
            }
            /**
             * Register an encrypter for configuration
             * @param name
             * @param encrypter
             */
            static registerEncrypter(name, encrypter) {
                if (_a.encrypters[name]) {
                    console.error("Encrypter", name, "already registered");
                }
                _a.encrypters[name] = encrypter;
            }
            /**
             * @override
             */
            async init() {
                await super.init();
                _a.encrypters["self"] = this;
                // Load keys
                if (this.parameters.autoCreate && !(await this.load())) {
                    await this.rotate();
                }
                return this;
            }
            /**
             *
             */
            async serveJWKS(context) {
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
            async load() {
                let load;
                try {
                    load = await useRegistry().get("keys");
                }
                catch (err) { }
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
            generateAsymetricKeys() {
                const { publicKey, privateKey } = generateKeyPairSync(
                // @ts-ignore
                this.parameters.asymetricType, this.parameters.asymetricOptions);
                return { publicKey, privateKey };
            }
            /**
             * Generate symetric key
             * @returns
             */
            generateSymetricKey() {
                return randomBytes(this.parameters.symetricKeyLength / 8).toString("base64");
            }
            /**
             * Return current key set
             */
            async getCurrentKeys() {
                if (!this.keys || !this.current || !this.keys[this.current]) {
                    let msg = "";
                    if (!this.keys) {
                        msg = ": No keys";
                    }
                    else if (!this.current) {
                        msg = ": No current key";
                    }
                    else if (!this.keys[this.current]) {
                        msg = ": Current key does not match";
                        msg += " (current=" + this.current + ", keys=[" + Object.keys(this.keys).join(",") + "])";
                    }
                    throw new Error("CryptoService not initialized" + msg);
                }
                return { keys: this.keys[this.current], id: this.current };
            }
            /**
             * Retrieve a HMAC for a string
             * @param data
             * @param keyId to use
             * @returns
             */
            async hmac(data, keyId) {
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
            async hmacVerify(data, hmac) {
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
            async jwtSign(data, options) {
                const res = { ...this.parameters.jwt, ...options };
                let key = res.secretOrPublicKey;
                // Default to our current private key
                if (!res.secretOrPublicKey) {
                    const keyInfo = await this.getCurrentKeys();
                    // Depending on the algo fallback to the right key
                    if (res.algorithm.startsWith("HS")) {
                        key = keyInfo.keys.symetric;
                        res.keyid = "S" + keyInfo.id;
                    }
                    else {
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
            async checkKey(keyId) {
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
            async getJWTKey(header, callback) {
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
                }
                else if (header.kid.startsWith("A")) {
                    callback(null, this.keys[keyId].publicKey);
                }
                else {
                    callback(new Error("Unknown key"));
                }
            }
            /**
             * JWT token verification
             */
            async jwtVerify(token, options) {
                return new Promise((resolve, reject) => {
                    jwt.verify(token, options?.secretOrPublicKey || this.getJWTKey.bind(this), {
                        ...options,
                        secretOrPublicKey: undefined
                    }, (err, result) => {
                        if (err) {
                            reject(err);
                        }
                        else {
                            resolve(result);
                        }
                    });
                });
            }
            /**
             * Encrypt data
             */
            async encrypt(data) {
                const key = await this.getCurrentKeys();
                // Initialization Vector
                const iv = randomBytes(16);
                const symKey = new Uint8Array(Buffer.from(key.keys.symetric, "base64"));
                const cipher = createCipheriv(this.parameters.symetricCipher, symKey, new Uint8Array(iv));
                const updated = cipher.update(new Uint8Array(Buffer.from(JSON.stringify(data))));
                const final = cipher.final();
                const encrypted = Buffer.concat([new Uint8Array(iv), new Uint8Array(updated), new Uint8Array(final)]).toString("base64");
                return this.jwtSign(encrypted, {
                    keyid: `S${key.id}`,
                    secretOrPublicKey: key.keys.symetric
                });
            }
            /**
             * Parse the JWT header section
             */
            getJWTHeader(token) {
                return JSON.parse(Buffer.from(token.split(".")[0], "base64").toString());
            }
            /**
             * Encrypt configuration
             * @param data
             */
            static async encryptConfiguration(data) {
                if (data instanceof Object) {
                    for (const i in data) {
                        data[i] = await _a.encryptConfiguration(data[i]);
                    }
                }
                else if (typeof data === "string") {
                    if (data.startsWith("encrypt:") || data.startsWith("sencrypt:")) {
                        let str = data.substring(data.indexOf(":") + 1);
                        const type = str.substring(0, str.indexOf(":"));
                        str = str.substring(str.indexOf(":") + 1);
                        if (!_a.encrypters[type]) {
                            throw new Error("Unknown encrypter " + type);
                        }
                        if (data.startsWith("s")) {
                            data = `scrypt:${type}:` + (await _a.encrypters[type].encrypt(str));
                        }
                        else {
                            data = `crypt:${type}:` + (await _a.encrypters[type].encrypt(str));
                        }
                    }
                }
                return data;
            }
            /**
             *
             * @param data
             */
            static async decryptConfiguration(data) {
                if (data instanceof Object) {
                    for (const i in data) {
                        data[i] = await _a.decryptConfiguration(data[i]);
                    }
                }
                else if (typeof data === "string") {
                    if (data.startsWith("crypt:") || data.startsWith("scrypt:")) {
                        let str = data.substring(data.indexOf(":") + 1);
                        const type = str.substring(0, str.indexOf(":"));
                        str = str.substring(str.indexOf(":") + 1);
                        if (!_a.encrypters[type]) {
                            throw new Error("Unknown encrypter " + type);
                        }
                        // We keep the ability to map to a simple string for incompatible module
                        if (data.startsWith("scrypt:")) {
                            return await _a.encrypters[type].decrypt(str);
                        }
                        else {
                            return new SecretString(await _a.encrypters[type].decrypt(str), type);
                        }
                    }
                }
                return data;
            }
            /**
             * Decrypt data
             */
            async decrypt(token) {
                const input = Buffer.from(await this.jwtVerify(token), "base64");
                const header = this.getJWTHeader(token);
                const iv = input.subarray(0, 16);
                const decipher = createDecipheriv(this.parameters.symetricCipher, new Uint8Array(Buffer.from(this.keys[header.kid.substring(1)].symetric, "base64")), new Uint8Array(iv));
                return JSON.parse(decipher.update(new Uint8Array(input.subarray(16))).toString() + decipher.final().toString());
            }
            /**
             * Get next id
             */
            getNextId() {
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
                const next = {
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
                    this.keys ?? (this.keys = {});
                    this.keys[id] = next[`key_${id}`];
                    this.current = id;
                    this.age = age;
                }
                catch (err) {
                    useLog("TRACE", "Failed to rotate keys", err);
                    // Reload as something else has modified
                    await this.load();
                    await this.getCurrentKeys();
                }
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _serveJWKS_decorators = [Route(".", ["GET"], {
                    description: "Serve JWKS keys",
                    get: {
                        operationId: "getJWKS"
                    }
                })];
            __esDecorate(_a, null, _serveJWKS_decorators, { kind: "method", name: "serveJWKS", static: false, private: false, access: { has: obj => "serveJWKS" in obj, get: obj => obj.serveJWKS }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a.encrypters = {},
        _a;
})();
export { CryptoService };
/**
 * Encrypt data with local machine id
 */
CryptoService.registerEncrypter("local", {
    encrypt: async (data) => {
        // Initialization Vector
        const iv = randomBytes(16);
        const key = createHash("sha256").update(getMachineId()).digest();
        const cipher = createCipheriv("aes-256-ctr", new Uint8Array(key), new Uint8Array(iv));
        const updated = cipher.update(new Uint8Array(Buffer.from(data)));
        const final = cipher.final();
        return Buffer.concat([new Uint8Array(iv), new Uint8Array(updated), new Uint8Array(final)]).toString("base64");
    },
    decrypt: async (data) => {
        const input = Buffer.from(data, "base64");
        const iv = input.subarray(0, 16);
        const key = createHash("sha256").update(getMachineId()).digest();
        const decipher = createDecipheriv("aes-256-ctr", new Uint8Array(key), new Uint8Array(iv));
        return decipher.update(new Uint8Array(input.subarray(16))).toString() + decipher.final().toString();
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
    return useService("CryptoService");
}
//# sourceMappingURL=cryptoservice.js.map