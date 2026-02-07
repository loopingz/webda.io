import { IStore } from "./icore.js";
import { createCoreHook, useInstanceStorage } from "./instancestorage.js";
import pkg from "node-machine-id";
import type { Model, ModelClass, Repository } from "@webda/models";
import { CustomConstructor } from "@webda/tsc-esm";
import { Service } from "../services/service.js";
import type CryptoService from "../services/cryptoservice.js";
import type { Store } from "../stores/store.js";
import type { Reflection } from "../internal/iapplication.js";
import { useModel } from "../application/hooks.js";
import type { Core } from "./core.js";
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
 * @param core
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
export function useService<K extends keyof ServicesMap>(name: K): ServicesMap[K];
//export function useService<T = Service>(name: ServiceName): T;
export function useService(name: ServiceName) {
  return useCore().getService(name) as Service;
}

/**
 * Get the metadata for a model
 * @param object
 * @returns
 */
export function useModelMetadata(name: string | Model | ModelClass): Reflection {
  if (name["Metadata"]) {
    return name["Metadata"];
  }
  return useModel(name as string | Model)?.Metadata;
}

/**
 * Use model store
 * @param name
 * @returns
 */
export function useModelStore<T extends Model>(name: string | T | CustomConstructor<T>): IStore {
  return useCore().getModelStore(name);
}

export function useModelRepository<T extends Model>(
  name: string | T | CustomConstructor<T>
): Repository<ModelClass<T>> {
  return useModelStore(name) as unknown as Repository<ModelClass<T>>;
}

/**
 * Get a machine id
 * @returns
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
