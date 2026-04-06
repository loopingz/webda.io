import type { IStore } from "./icore.js";
import { useInstanceStorage } from "./instancestorage.js";
import pkg from "node-machine-id";
import type { Model, ModelClass, Repository } from "@webda/models";
import type { CustomConstructor } from "@webda/tsc-esm";
import type { Service } from "../services/service.js";
import type CryptoService from "../services/cryptoservice.js";
import type { Store } from "../stores/store.js";
import type { ModelMetadata } from "@webda/compiler";
import { useModel } from "../application/hooks.js";
import type { Core } from "./core.js";
import type { SessionManager } from "../session/manager.js";
const { machineIdSync } = pkg;

/**
 * Get the current core
 * @returns the current core
 */
export function useCore<T extends Core = Core>(): T {
  return useInstanceStorage().core as T;
}

/**
 * Set the current core
 * @param core - the Core instance
 */
export function setCore(core: Core) {
  useInstanceStorage().core = core;
}

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
 * @param name - the name to use
 * @returns the result map
 */
export function useService<K extends keyof ServicesMap>(name: K): ServicesMap[K];
//export function useService<T = Service>(name: ServiceName): T;
export function useService(name: ServiceName) {
  return useCore().getService(name) as Service;
}

/**
 * When you want to use a service that is not defined in the ServicesMap, you can use this function
 * @param name - the name to use
 * @returns the result
 */
export function useDynamicService<T = Service>(name: string): T {
  return useService(name as keyof ServicesMap) as T;
}

/**
 * Get the metadata for a model
 * @param object - the target object
 * @param name - the name to use
 * @returns the result
 */
export function useModelMetadata(name: string | Model | ModelClass): ModelMetadata {
  if (name["Metadata"]) {
    return name["Metadata"];
  }
  return useModel(name as string | Model)?.Metadata;
}

/**
 * Use model store
 * @param name - the name to use
 * @returns the result
 */
export function useModelStore<T extends Model>(name: string | T | CustomConstructor<T>): IStore {
  return useCore().getModelStore(name);
}

/**
 * Get the repository for a model, typed as Repository
 * @param name - the name to use
 * @returns the result
 */
export function useModelRepository<T extends Model>(
  name: string | T | CustomConstructor<T>
): Repository<ModelClass<T>> {
  return useModelStore(name) as unknown as Repository<ModelClass<T>>;
}

/**
 * Get a machine id
 * @returns the result
 */
export function getMachineId() {
  try {
    return process.env["WEBDA_MACHINE_ID"] || machineIdSync();
    /* c8 ignore next 4 */
  } catch (err) {
    // Useful in k8s pod
    return process.env["HOSTNAME"];
  }
}
