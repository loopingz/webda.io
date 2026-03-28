import { AsyncLocalStorage } from "async_hooks";
import { useApplication } from "../application/hooks.js";
// Test are transpiling and creating several instances of 'instancestorage.ts'
process["webdaInstanceStorage"] ?? (process["webdaInstanceStorage"] = new AsyncLocalStorage());
const storage = process["webdaInstanceStorage"];
export function useInstanceStorage() {
    const store = storage.getStore();
    if (!store) {
        throw new Error("Webda launched outside of a InstanceStorage context");
    }
    return store;
}
export function runWithInstanceStorage(instanceStorage = {}, fn) {
    return storage.run({
        application: undefined,
        operations: {},
        core: undefined,
        contextProviders: [],
        router: undefined,
        interruptables: new Set(),
        ...instanceStorage
    }, fn);
}
/**
 * Create a hook that is present in the instance storage
 * @param hookName
 * @returns
 */
export function createCoreHook(hookName) {
    return [
        () => useInstanceStorage()[hookName],
        (value) => {
            useInstanceStorage()[hookName] = value;
        }
    ];
}
/**
 * Create a custom hook that is not reserved
 * @param hookName
 * @returns
 */
export function createHook(hookName) {
    return [
        () => useInstanceStorage()[hookName],
        (value) => {
            useInstanceStorage()[hookName] = value;
        }
    ];
}
export function registerInteruptableProcess(process) {
    useInstanceStorage().interruptables.add(process);
}
export function unregisterInteruptableProcess(process) {
    useInstanceStorage().interruptables.delete(process);
}
export function useParameters() {
    return useApplication().getConfiguration().parameters;
}
//# sourceMappingURL=instancestorage.js.map