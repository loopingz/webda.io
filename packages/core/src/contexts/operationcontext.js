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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
import { IOperationContext } from "./icontext.js";
import { WritableStreamBuffer } from "stream-buffers";
import { Session } from "../session/session.js";
import { NotEnumerable } from "@webda/tsc-esm";
import sanitize from "sanitize-html";
import { JSONUtils } from "@webda/utils";
import { useLog } from "../loggers/hooks.js";
import { runAsSystem } from "./execution.js";
import { useModelRepository } from "../core/hooks.js";
/**
 * OperationContext is used when call to an operation
 *
 * @param T type of input for this context
 * @param U type of output for this context
 * @param P type of parameters for this context
 */
let OperationContext = (() => {
    var _a;
    let _classSuper = IOperationContext;
    let __stream_decorators;
    let __stream_initializers = [];
    let __stream_extraInitializers = [];
    return _a = class OperationContext extends _classSuper {
            /**
             * @ignore
             * Used by Webda framework to set the body, session and output stream if known
             */
            constructor(stream = undefined) {
                super();
                /**
                 * Output stream
                 */
                this._stream = __runInitializers(this, __stream_initializers, void 0);
                __runInitializers(this, __stream_extraInitializers);
                this.extensions = {};
                this._promises = [];
                this._body = undefined;
                this._stream = stream;
                if (stream === undefined) {
                    this.createStream();
                }
                this.parameters = {};
            }
            /**
             * Set the session
             * @param session
             */
            setSession(session) {
                this.session = session;
            }
            /**
             * Get an extension of the context
             * @param name of the extension
             * @returns extension object
             */
            getExtension(name) {
                return this.extensions[name];
            }
            /**
             * Get one parameter
             * @param name
             * @returns
             */
            parameter(name, defaultValue = undefined) {
                return this.getParameters()[name] ?? defaultValue;
            }
            /**
             * Get the parameters
             * @returns
             */
            getParameters() {
                return this.parameters;
            }
            /**
             * Set the parameters
             */
            setParameters(params) {
                this.parameters = params;
            }
            /**
             *
             * @param name to add
             * @param extension object to store
             */
            setExtension(name, extension) {
                this.extensions[name] = extension;
                return this;
            }
            /**
             * Register a promise with the context
             * @param promise
             */
            addAsyncRequest(promise) {
                this._promises.push(promise);
            }
            /**
             * Get output as string, if a OutputStream is provided it will returned null
             * @returns
             */
            getOutput() {
                if (this._stream instanceof WritableStreamBuffer && this._stream.size()) {
                    return this._stream.getContents().toString();
                }
                return this._body;
            }
            /**
             * Ensure the whole execution is finished
             */
            async end() {
                await Promise.all(this._promises);
            }
            /**
             * Remove the input
             */
            clearInput() {
                this._sanitized = {};
            }
            async getInput(sanitizedOptions = {
                allowedTags: [],
                allowedAttributes: {}
            }) {
                if (this._sanitized && !sanitizedOptions.raw) {
                    return this._sanitized;
                }
                const recursiveSanitize = (obj, options = undefined, path = "") => {
                    if (typeof obj === "string") {
                        return sanitize(obj, options);
                    }
                    if (obj !== null && typeof obj === "object") {
                        Object.keys(obj).forEach(key => {
                            obj[key] =
                                Array.isArray(sanitizedOptions.raw) && sanitizedOptions.raw.includes(path + key)
                                    ? obj[key]
                                    : recursiveSanitize(obj[key], options, path + key + ".");
                        });
                    }
                    return obj;
                };
                try {
                    // TODO define this
                    const { requestLimit, requestTimeout } = { requestLimit: 10 * 1024 * 1024, requestTimeout: 60000 };
                    const data = await this.getRawInputAsString(requestLimit, requestTimeout);
                    if (sanitizedOptions.raw === true) {
                        return JSON.parse(data || sanitizedOptions.defaultValue);
                    }
                    if (!data || data.length === 0) {
                        this._sanitized = sanitizedOptions.defaultValue;
                        return this._sanitized;
                    }
                    this._sanitized = recursiveSanitize(JSON.parse(data), sanitizedOptions);
                }
                catch (err) {
                    useLog("ERROR", err, `Body: '${await this.getRawInputAsString()}'`);
                    this._sanitized = sanitizedOptions.defaultValue;
                }
                return this._sanitized;
            }
            /**
             * By default empty
             * @returns
             */
            async getRawInputAsString(limit = 1024 * 1024 * 10, timeout = 60000, encoding) {
                return (await this.getRawInput(limit, timeout)).toString(encoding);
            }
            /**
             * @override
             */
            async getRawInput(_limit = 1024 * 1024 * 10, _timeout = 60000) {
                return Buffer.from("");
            }
            /**
             * @override
             */
            getRawStream() {
                return undefined;
            }
            /**
             * Get the HTTP stream to output raw data
             * @returns {*}
             */
            async getOutputStream() {
                await this.flushHeaders();
                return this._stream;
            }
            /**
             * Get linked session
             * @returns
             */
            getSession() {
                return this.session;
            }
            newSession() {
                this.session = new Session();
                return this.session;
            }
            /**
             * Remove sanitized body
             */
            reinit() {
                this._sanitized = undefined;
                if (!this._stream || this._stream instanceof WritableStreamBuffer) {
                    this.createStream();
                }
            }
            /**
             * Create a buffer stream
             */
            createStream() {
                this._stream = new WritableStreamBuffer({
                    initialSize: 100 * 1024,
                    incrementAmount: 100 * 1024
                });
            }
            /**
             * Remove everything that was about to be sent
             */
            resetResponse() {
                this._body = undefined;
                if (this._stream instanceof WritableStreamBuffer) {
                    this.createStream();
                }
            }
            /**
             * Write data to the client
             *
             * @param output If it is an object it will be serialized with toPublicJSON, if it is a String it will be appended to the result, if it is a buffer it will replace the result
             * @param ...args any arguments to pass to the toPublicJSON method
             */
            write(output, _encoding, _cb) {
                if (!output) {
                    return false;
                }
                if (typeof output === "object" && !(output instanceof Buffer)) {
                    this._body = JSONUtils.stringify(output, undefined, 0, true);
                }
                else if (typeof output == "string") {
                    if (this._body == undefined) {
                        this._body = "";
                    }
                    this._body += output;
                }
                else {
                    this._body = output.toString();
                }
                return true;
            }
            async init() {
                return this;
            }
            /**
             * Get the current user from session
             */
            async getCurrentUser(refresh = false) {
                if (!this.getCurrentUserId()) {
                    return undefined;
                }
                // Caching the answer
                if (!this.user || refresh) {
                    await runAsSystem(async () => {
                        this.user = await useModelRepository("User").fromUID(this.getCurrentUserId()).get();
                    });
                }
                return this.user;
            }
            /**
             * Get the current user id from session
             */
            getCurrentUserId() {
                if (this.session) {
                    return this.session.userId;
                }
                return undefined;
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __stream_decorators = [NotEnumerable];
            __esDecorate(null, null, __stream_decorators, { kind: "field", name: "_stream", static: false, private: false, access: { has: obj => "_stream" in obj, get: obj => obj._stream, set: (obj, value) => { obj._stream = value; } }, metadata: _metadata }, __stream_initializers, __stream_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { OperationContext };
//# sourceMappingURL=operationcontext.js.map