import { IStore, IService } from "./icore";
import { createCoreHook } from "./instancestorage";
import pkg from "node-machine-id";
//import { machineIdSync } from "node-machine-id";
const { machineIdSync } = pkg;

const [useCore, setCore] = createCoreHook("core");

export { useCore, setCore };

export function useService<T extends IService>(name: string): T {
  return <T>useCore().getService(name);
}

export function useModelStore(name: string): IStore {
  return useCore().getModelStore(name);
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
