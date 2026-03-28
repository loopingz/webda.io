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
import { NotEnumerable } from "@webda/tsc-esm";
import { pipeline } from "node:stream/promises";
/**
 * Context is the object that will be passed to the services
 */
let Context = (() => {
    var _a;
    let __promises_decorators;
    let __promises_initializers = [];
    let __promises_extraInitializers = [];
    return _a = class Context {
            constructor() {
                /**
                 * Store response headers
                 */
                this.responseHeaders = {};
                /**
                 * Contain all registered promises to this context
                 */
                this._promises = __runInitializers(this, __promises_initializers, void 0);
                /**
                 * If the headers were flushed
                 */
                this.flushed = (__runInitializers(this, __promises_extraInitializers), false);
            }
            isGlobalContext() {
                return false;
            }
            /**
             * Register a promise with the context
             * @param promise
             */
            registerPromise(promise) {
                this._promises.push(promise);
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
             *
             * @param name to add
             * @param extension object to store
             */
            setExtension(name, extension) {
                this.extensions[name] = extension;
                return this;
            }
            /**
             * Ensure the whole execution is finished
             */
            async end() {
                await Promise.all(this._promises);
                await this.flushHeaders();
            }
            /**
             * Can be used to init the context if needed
             * Reading from the input or reaching to a db
             * @returns
             */
            async init() {
                return this;
            }
            /**
             * Set a header in the response
             */
            setHeader(name, value) {
                if (this.flushed) {
                    throw new Error("Headers have been sent already");
                }
                this.responseHeaders[name] = value;
            }
            /**
             * For easier compatibility with WebContext
             * On OperationContext this call is simply ignored
             */
            writeHead(_code, headers) {
                // Do nothing
                Object.entries(headers).forEach(([key, value]) => {
                    this.setHeader(key, value);
                });
            }
            /**
             * Get current response headers
             */
            getResponseHeaders() {
                return this.responseHeaders;
            }
            /**
             * Send the headers to the client
             */
            async flushHeaders() {
                if (this.flushed) {
                    return;
                }
                this.responseHeaders = {};
                this.flushed = true;
            }
            /**
             * Pipeline streams into the output stream
             *
             * @see https://nodejs.org/api/stream.html#streampipelinestreams-options
             */
            async pipeline(stream1, ...streams) {
                const isPipelineOptions = (arg) => arg.writable === undefined;
                const item = streams.pop();
                if (isPipelineOptions(item)) {
                    return pipeline([stream1, ...streams, await this.getOutputStream()], item);
                }
                else {
                    return pipeline([stream1, ...streams, await this.getOutputStream()]);
                }
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __promises_decorators = [NotEnumerable];
            __esDecorate(null, null, __promises_decorators, { kind: "field", name: "_promises", static: false, private: false, access: { has: obj => "_promises" in obj, get: obj => obj._promises, set: (obj, value) => { obj._promises = value; } }, metadata: _metadata }, __promises_initializers, __promises_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { Context };
export class IOperationContext extends Context {
    /**
     * Read one specific parameter
     * @param name
     * @returns
     * @deprecated Use getParameters
     */
    parameter(name, defaultValue) {
        return this.getParameters()[name] ?? defaultValue;
    }
}
/**
 * Set the context update
 */
let contextUpdate = false;
/**
 * Set the context update
 * @param value
 */
export function setContextUpdate(value) {
    contextUpdate = value;
}
/**
 * Who can update the context
 * @returns
 */
export function canUpdateContext() {
    return contextUpdate;
}
/**
 * Return the gather information from the repository
 * @param obj
 * @returns
 */
export function isWebContext(obj) {
    return obj.getHttpContext !== undefined && obj.cookie !== undefined;
}
//# sourceMappingURL=icontext.js.map