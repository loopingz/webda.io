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
/**
 * Session
 */
let Session = (() => {
    var _a;
    let _changed_decorators;
    let _changed_initializers = [];
    let _changed_extraInitializers = [];
    return _a = class Session {
            constructor() {
                this.changed = __runInitializers(this, _changed_initializers, false);
                /**
                 * Session uuid
                 */
                this.uuid = __runInitializers(this, _changed_extraInitializers);
            }
            /**
             * Login
             * @param userId
             * @param identUsed
             */
            login(userId, identUsed) {
                this.userId = userId;
                this.identUsed = identUsed;
            }
            /**
             * Logout
             */
            logout() {
                delete this.userId;
                delete this.identUsed;
                delete this.roles;
            }
            /**
             * If session is authenticated
             */
            isLogged() {
                return this.userId !== undefined;
            }
            /**
             * Session is dirty and requires save
             * @returns
             */
            isDirty() {
                return this.changed;
            }
            /**
             * Get the proxy to be able to track modification
             * @returns
             */
            getProxy() {
                const proxyHandler = {
                    set: (obj, property, value) => {
                        this.changed = true;
                        obj[property] = value;
                        return true;
                    },
                    get: (obj, property) => {
                        if (typeof obj[property] === "object") {
                            return new Proxy(obj[property], proxyHandler);
                        }
                        return obj[property];
                    }
                };
                return new Proxy(this, proxyHandler);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _changed_decorators = [NotEnumerable];
            __esDecorate(null, null, _changed_decorators, { kind: "field", name: "changed", static: false, private: false, access: { has: obj => "changed" in obj, get: obj => obj.changed, set: (obj, value) => { obj.changed = value; } }, metadata: _metadata }, _changed_initializers, _changed_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { Session };
/**
 * Unknown session that allows all keys
 */
export class UnknownSession extends Session {
}
//# sourceMappingURL=session.js.map