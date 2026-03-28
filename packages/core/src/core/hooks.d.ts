import { IStore } from "./icore.js";
import type { Model, ModelClass, Repository } from "@webda/models";
import { CustomConstructor } from "@webda/tsc-esm";
import { Service } from "../services/service.js";
import type CryptoService from "../services/cryptoservice.js";
import type { Store } from "../stores/store.js";
import type { ModelMetadata } from "@webda/compiler";
import type { Core } from "./core.js";
import { SessionManager } from "../session/manager.js";
/**
 * Get the current core
 * @returns the current core
 */
export declare function useCore<T extends Core = Core>(): T;
/**
 * Set the current core
 * @param core
 */
export declare function setCore(core: Core): void;
/**
 * Services Map
 */
export interface ServicesMap {
    Registry: Store;
    CryptoService: CryptoService;
    SessionManager: SessionManager;
}
/**
 * Represent a service name in webda
 *
 * Useful for referencing other services within the framework
 * @serviceName
 * @schemaInherits
 */
export type ServiceName = keyof ServicesMap;
/**
 * Get a service by name
 * @param name
 * @returns
 */
export declare function useService<K extends keyof ServicesMap>(name: K): ServicesMap[K];
/**
 * When you want to use a service that is not defined in the ServicesMap, you can use this function
 * @param name
 * @returns
 */
export declare function useDynamicService<T = Service>(name: string): T;
/**
 * Get the metadata for a model
 * @param object
 * @returns
 */
export declare function useModelMetadata(name: string | Model | ModelClass): ModelMetadata;
/**
 * Use model store
 * @param name
 * @returns
 */
export declare function useModelStore<T extends Model>(name: string | T | CustomConstructor<T>): IStore;
export declare function useModelRepository<T extends Model>(name: string | T | CustomConstructor<T>): Repository<ModelClass<T>>;
/**
 * Get a machine id
 * @returns
 */
export declare function getMachineId(): string;
//# sourceMappingURL=hooks.d.ts.map