import { IStore } from "./icore";
import { AbstractService, Reflection } from "../internal/iapplication";
import { createCoreHook } from "./instancestorage";
import pkg from "node-machine-id";
import type { Model, ModelClass, Repository } from "@webda/models";
//import { machineIdSync } from "node-machine-id";
const { machineIdSync } = pkg;

const [useCore, setCore] = createCoreHook("core");

export { useCore, setCore };

export function useService<T = AbstractService>(name: string): T {
  return <T>useCore().getService(name);
}

/**
 * Use model store
 * @param name 
 * @returns 
 */
export function useModelStore<T extends Model>(name: string | T | ModelClass<T>): IStore {
  return useCore().getModelStore(name);
}

export function useModelRepository<T extends Model>(name: string | T | ModelClass<T>): Repository<ModelClass<T>> {
  return useModelStore(name) as unknown as Repository<ModelClass<T>>;
}

export function useModelMetadata(name: string | Model | ModelClass<Model>): Reflection {
  return {} as Reflection;
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
