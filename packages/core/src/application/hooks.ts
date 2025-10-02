import { createCoreHook } from "../core/instancestorage";
import type { Model } from "@webda/models";
import { ModelDefinition } from "../internal/iapplication";
/**
 * Hook to get the current application
 *
 * We use a _ to be able to document the subhooks
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
export function useModel<T extends Model = Model>(name: string | T): ModelDefinition<T> {
  if (name === undefined) {
    throw new Error("Cannot call useModel with undefined");
  }
  if (typeof name !== "string") {
    return <ModelDefinition<T>>useApplication().getModel(name.constructor as any);
  }
  return <ModelDefinition<T>>useApplication().getModel(name);
}

/**
 * Get the model id for an object in the application
 *
 * @param object instance or class
 * @returns The model identifier or undefined if not found, e.g. "User" or "Webda/User"
 */
export function useModelId(object: any): string | undefined {
  // TODO Check for full
  return useApplication().getModelId(object);
}
