import { useInstanceStorage } from "../core/instancestorage.js";
/**
 * Get the current application
 */
export function useApplication() {
    return useInstanceStorage().application; // Ensure we are in a instance storage context
}
/**
 * Set the current application
 *
 * @param application
 */
export function setApplication(application) {
    useInstanceStorage().application = application;
}
/**
 * Useful if you want to allow model override
 * @param name
 * @returns
 */
export function useModel(name) {
    if (name === undefined) {
        throw new Error("Cannot call useModel with undefined");
    }
    if (typeof name !== "string") {
        return useApplication().getModel(name.constructor);
    }
    return useApplication().getModel(name);
}
/**
 * Get the model id for an object in the application
 *
 * @param object instance or class
 * @returns The model identifier or undefined if not found, e.g. "User" or "Webda/User"
 */
export function useModelId(object) {
    return useApplication().getModelId(object);
}
//# sourceMappingURL=hooks.js.map