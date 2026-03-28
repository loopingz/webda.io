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
import { Counter, Histogram } from "../metrics/metrics.js";
import * as WebdaError from "../errors/errors.js";
import { registerRepository } from "@webda/models";
import { ServiceParameters } from "../services/serviceparameters.js";
import { Service } from "../services/service.js";
import { useApplication, useModelId } from "../application/hooks.js";
import { useLog } from "../loggers/hooks.js";
import { useCore } from "../core/hooks.js";
import { InstanceCache } from "../cache/cache.js";
export class StoreNotFoundError extends WebdaError.CodeError {
    constructor(uuid, storeName) {
        super("STORE_NOTFOUND", `Item not found ${uuid} Store(${storeName})`);
    }
}
export class UpdateConditionFailError extends WebdaError.CodeError {
    constructor(uuid, conditionField, condition) {
        super("STORE_UPDATE_CONDITION_FAILED", `UpdateCondition not met on ${uuid}.${conditionField} === ${condition instanceof Date ? condition.toISOString() : condition}`);
    }
}
/**
 * Store parameter
 */
export class StoreParameters extends ServiceParameters {
    load(params) {
        // REFACTOR >= 5
        if (params.expose) {
            throw new Error("Expose is not supported anymore, use DomainService instead");
        }
        // END_REFACTOR
        super.load(params);
        this.model ?? (this.model = "Webda/RegistryEntry");
        this.strict ?? (this.strict = false);
        this.defaultModel ?? (this.defaultModel = true);
        this.forceModel ?? (this.forceModel = false);
        this.slowQueryThreshold ?? (this.slowQueryThreshold = 30000);
        this.modelAliases ?? (this.modelAliases = {});
        this.additionalModels ?? (this.additionalModels = []);
        return this;
    }
}
/**
 * This class handle NoSQL storage and mapping (duplication) between NoSQL object
 *
 * It emits events :
 *   Store.Save: Before saving the object
 *   Store.Saved: After saving the object
 *   Store.Update: Before updating the object
 *   Store.Updated: After updating the object
 *   Store.Delete: Before deleting the object
 *   Store.Deleted: After deleting the object
 *   Store.Get: When getting the object
 *   Store.Action: When an action will be done on an object
 *   Store.Actioned: When an action has been done on an object
 *
 * @category CoreServices
 */
let Store = (() => {
    var _a;
    let _classSuper = Service;
    let _staticExtraInitializers = [];
    let _static_computeStores_decorators;
    return _a = class Store extends _classSuper {
            constructor() {
                super(...arguments);
                /**
                 * Store the manager hierarchy with their depth
                 */
                this._modelsHierarchy = {};
            }
            static computeStores() {
                // Gather all stores and register Repository
                const stores = Object.values(useCore().getServices()).filter(s => s instanceof _a);
                const models = Object.values(useApplication().getModels());
                const registry = useCore().getService("Registry");
                // Check each available models
                for (const model of models) {
                    // Model can be null?
                    if (!model)
                        continue;
                    if (!model.Metadata || !Array.isArray(model.Metadata.PrimaryKey)) {
                        useLog("WARN", `${useModelId(model)} does not have Metadata or PrimaryKey defined`);
                        continue;
                    }
                    let currentValue = -1;
                    let currentStore = undefined;
                    for (const store of stores) {
                        const value = store.handleModel(model);
                        if (value < 0 || (value > currentValue && currentValue !== -1)) {
                            continue;
                        }
                        currentValue = value;
                        currentStore = store;
                    }
                    if (!currentStore) {
                        useLog("TRACE", `${useModelId(model)} fallback to Registry store`);
                        currentStore = registry;
                    }
                    // Register the repository
                    registerRepository(model, currentStore.getRepository(model));
                    useLog("DEBUG", `${useModelId(model)} using store ${currentStore.getName()}`);
                }
            }
            /**
             * Retrieve the Model
             *
             * @throws Error if model is not found
             */
            computeParameters() {
                /*
                super.computeParameters();
                const app = useApplication();
                this._model = useModel(this.parameters.model);
                if (!this._model) {
                  throw new Error(`Model not found: ${this.parameters.model}`);
                }
                this._modelMetadata = useModelMetadata(this._model);
                if (!this._modelMetadata) {
                  throw new Error(`Model Metadata not found: ${this.parameters.model}`);
                }
                useLog("TRACE", "METADATA", this._modelMetadata);
                this._modelType = this._modelMetadata.Identifier;
                const recursive = (tree: ModelClass[], depth) => {
                  for (const model of tree) {
                    this._modelsHierarchy[this._modelMetadata.Identifier] ??= depth;
                    this._modelsHierarchy[this._modelMetadata.Identifier] = Math.min(
                      depth,
                      this._modelsHierarchy[this._modelMetadata.Identifier]
                    );
                    recursive(this._modelMetadata.Subclasses, depth + 1);
                  }
                };
                // Compute the hierarchy
                this._modelsHierarchy[this._modelMetadata.Identifier] = 0;
                // Strict Store only store their model
                if (!this.parameters.strict) {
                  recursive(this._modelMetadata.Subclasses, 1);
                }
                // Add additional models
                if (this.parameters.additionalModels.length) {
                  // Strict mode is to only allow one model per store
                  if (this.parameters.strict) {
                    this.log("ERROR", "Cannot add additional models in strict mode");
                  } else {
                    for (const modelType of this.parameters.additionalModels) {
                      const model = useModel(modelType);
                      this._modelsHierarchy[this._modelMetadata.Identifier] = 0;
                      recursive(this._modelMetadata.Subclasses, 1);
                    }
                  }
                }
                */
            }
            logSlowQuery(_query, _reason, _time) {
                // TODO Need to implement: https://github.com/loopingz/webda.io/issues/202
            }
            /**
             * Initialize the store
             * @returns
             */
            async init() {
                _a.computeStores();
                return super.init();
            }
            /**
             * @override
             */
            initMetrics() {
                super.initMetrics();
                this.metrics.operations_total = this.getMetric(Counter, {
                    name: "operations_total",
                    help: "Operations counter for this store",
                    labelNames: ["operation"]
                });
                this.metrics.slow_queries_total = this.getMetric(Counter, {
                    name: "slow_queries",
                    help: "Number of slow queries encountered"
                });
                // this.metrics.cache_invalidations = this.getMetric(Counter, {
                //   name: "cache_invalidations",
                //   help: "Number of cache invalidation encountered"
                // });
                // this.metrics.cache_hits = this.getMetric(Counter, {
                //   name: "cache_hits",
                //   help: "Number of cache hits"
                // });
                this.metrics.queries = this.getMetric(Histogram, {
                    name: "queries",
                    help: "Query duration"
                });
            }
            /**
             * Return Store current model
             * @returns
             */
            getModel() {
                return this._model;
            }
            /**
             * Return if a model is handled by the store
             * @param model
             * @return distance from the managed class -1 means not managed, 0 manage exactly this model, >0 manage an ancestor model
             *
             */
            handleModel(model) {
                const name = useModelId(model);
                return this._modelsHierarchy[name] ?? -1;
            }
            /**
             * Check that keys are valid
             * All keys of model stored in a Store must have the same type of primary key
             */
            checkKeys() {
                // TODO Implement
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _static_computeStores_decorators = [InstanceCache()];
            __esDecorate(_a, null, _static_computeStores_decorators, { kind: "method", name: "computeStores", static: true, private: false, access: { has: obj => "computeStores" in obj, get: obj => obj.computeStores }, metadata: _metadata }, null, _staticExtraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_a, _staticExtraInitializers);
        })(),
        _a;
})();
export { Store };
//# sourceMappingURL=store.js.map