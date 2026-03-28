import { useInstanceStorage } from "./instancestorage.js";
import pkg from "node-machine-id";
import { useModel } from "../application/hooks.js";
const { machineIdSync } = pkg;
/**
 * Get the current core
 * @returns the current core
 */
export function useCore() {
    return useInstanceStorage().core;
}
/**
 * Set the current core
 * @param core
 */
export function setCore(core) {
    useInstanceStorage().core = core;
}
//export function useService<T = Service>(name: ServiceName): T;
export function useService(name) {
    return useCore().getService(name);
}
/**
 * When you want to use a service that is not defined in the ServicesMap, you can use this function
 * @param name
 * @returns
 */
export function useDynamicService(name) {
    return useService(name);
}
/**
 * Get the metadata for a model
 * @param object
 * @returns
 */
export function useModelMetadata(name) {
    if (name["Metadata"]) {
        return name["Metadata"];
    }
    return useModel(name)?.Metadata;
}
/**
 * Use model store
 * @param name
 * @returns
 */
export function useModelStore(name) {
    return useCore().getModelStore(name);
}
export function useModelRepository(name) {
    return useModelStore(name);
}
/**
 * Get a machine id
 * @returns
 */
export function getMachineId() {
    try {
        return process.env["WEBDA_MACHINE_ID"] || machineIdSync();
        /* c8 ignore next 4 */
    }
    catch (err) {
        // Useful in k8s pod
        return process.env["HOSTNAME"];
    }
}
//# sourceMappingURL=hooks.js.map