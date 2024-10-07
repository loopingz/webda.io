import { createCoreHook } from "../core/instancestorage";

/**
 * Hook to get the current application
 */
const [_useApplication, _setApplication] = createCoreHook("application");

/**
 * Get the current application
 */
const useApplication = _useApplication;
/**
 * Set the current application
 *
 * @param application
 */
const setApplication = _setApplication;
export { useApplication, setApplication };

// Subhooks - using the application to shortcut to a specific

/**
 * Useful if you want to allow model override
 * @param name
 * @returns
 */
export function useModel(name: string) {
  return useApplication().getModelDefinition(name);
}

/**
 *
 * @param name
 * @returns
 */
export function useSchema(name: string) {
  return useApplication().getSchemas()[name];
}

/**
 * Get the model id for an object in the application
 *
 * @param object instance or class
 * @param full if true always include the namespace, default is false e.g Webda/
 * @returns The model identifier or undefined if not found, e.g. "User" or "Webda/User"
 */
export function useModelId(object: any, full: boolean = false): string | undefined {
  return useApplication().getModelId(object, full);
}
