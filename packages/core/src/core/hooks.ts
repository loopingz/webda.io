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
 * Get a service by name
 * @param name
 * @returns
 */
export function useService<K extends Store = Store>(name: "Registry"): K;
export function useService<K extends CryptoService = CryptoService>(name: "CryptoService"): K;
export function useService<K = Service>(name: string): K;
export function useService(name: string) {
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
