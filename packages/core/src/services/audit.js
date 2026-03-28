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
import { useCoreEvents } from "../events/events.js";
import { Inject, Service } from "../services/service.js";
/**
 * Define audit entry
 */
let AuditService = (() => {
    var _a;
    let _classSuper = Service;
    let _auditStore_decorators;
    let _auditStore_initializers = [];
    let _auditStore_extraInitializers = [];
    return _a = class AuditService extends _classSuper {
            constructor() {
                super(...arguments);
                this.auditStore = __runInitializers(this, _auditStore_initializers, void 0);
                this.test = __runInitializers(this, _auditStore_extraInitializers);
            }
            resolve() {
                super.resolve();
                useCoreEvents("Webda.OperationFailure", async (evt) => {
                    await this.addAuditEntry(evt.context, evt.error);
                });
                useCoreEvents("Webda.OperationSuccess", async (evt) => {
                    await this.addAuditEntry(evt.context);
                });
                return this;
            }
            async addAuditEntry(ctx, err) {
                if (!this.auditStore) {
                    return;
                }
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _auditStore_decorators = [Inject("auditStore", "auditStore")];
            __esDecorate(null, null, _auditStore_decorators, { kind: "field", name: "auditStore", static: false, private: false, access: { has: obj => "auditStore" in obj, get: obj => obj.auditStore, set: (obj, value) => { obj.auditStore = value; } }, metadata: _metadata }, _auditStore_initializers, _auditStore_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
//# sourceMappingURL=audit.js.map