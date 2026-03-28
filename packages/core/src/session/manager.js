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
import { Inject, Service } from "../services/service.js";
import { CookieOptions, SecureCookie } from "./cookie.js";
import { isWebContext } from "../contexts/icontext.js";
import { getUuid } from "@webda/utils";
import { ServiceParameters } from "../services/serviceparameters.js";
import { Session } from "./session.js";
import { UuidModel } from "@webda/models";
/**
 * Manage load and save of sessions
 */
export class SessionManager extends Service {
}
export class SessionModel extends UuidModel {
    constructor(data) {
        super(data);
        this.ttl = data.ttl || 0;
        this.session = data.session || {};
    }
}
export class CookieSessionParameters extends ServiceParameters {
    load(params = {}) {
        super.load(params);
        this.cookie = new CookieOptions(this.cookie || {});
        return this;
    }
}
/**
 * SessionManager that store info in a cookie
 *
 * If SessionStore service exists, only uuid is in the cookie
 * the rest of data is stored within the session store
 *
 * @WebdaModda
 */
let CookieSessionManager = (() => {
    var _a;
    let _classSuper = SessionManager;
    let _cryptoService_decorators;
    let _cryptoService_initializers = [];
    let _cryptoService_extraInitializers = [];
    return _a = class CookieSessionManager extends _classSuper {
            constructor() {
                super(...arguments);
                this.cryptoService = __runInitializers(this, _cryptoService_initializers, void 0);
                this.sessionModel = __runInitializers(this, _cryptoService_extraInitializers);
            }
            /**
             * @override
             */
            async load(context) {
                if (!isWebContext(context)) {
                    return new Session();
                }
                const session = new Session();
                const cookie = await SecureCookie.load(this.parameters.cookie.name, session, context, this.parameters.jwt);
                if (this.sessionModel) {
                    if (cookie.sub) {
                        Object.assign(session, (await this.sessionModel.get(cookie.sub))?.session);
                        session.uuid = cookie.sub;
                    }
                    session.uuid ?? (session.uuid = getUuid("base64"));
                }
                else {
                    Object.assign(session, cookie);
                }
                return session;
            }
            /**
             * @override
             */
            async save(context, session) {
                if (!isWebContext(context)) {
                    return;
                }
                // If store is found session info are stored in db
                if (this.sessionModel) {
                    if (this.sessionModel.exists(session.uuid)) {
                        await this.sessionModel.update({
                            uuid: session.uuid,
                            session,
                            ttl: Date.now() + this.parameters.cookie.maxAge * 1000
                        });
                    }
                    else {
                        await this.sessionModel.create({
                            uuid: session.uuid,
                            session,
                            ttl: Date.now() + this.parameters.cookie.maxAge * 1000
                        });
                    }
                    SecureCookie.save(this.parameters.cookie.name, context, {}, { ...this.parameters.jwt, subject: session.uuid.toString() }, this.parameters.cookie);
                    return;
                }
                SecureCookie.save(this.parameters.cookie.name, context, session, this.parameters.jwt, this.parameters.cookie);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _cryptoService_decorators = [Inject("CryptoService")];
            __esDecorate(null, null, _cryptoService_decorators, { kind: "field", name: "cryptoService", static: false, private: false, access: { has: obj => "cryptoService" in obj, get: obj => obj.cryptoService, set: (obj, value) => { obj.cryptoService = value; } }, metadata: _metadata }, _cryptoService_initializers, _cryptoService_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CookieSessionManager };
//# sourceMappingURL=manager.js.map