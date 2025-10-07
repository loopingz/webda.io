import { useInstanceStorage } from "../core/instancestorage";
import type { Model } from "@webda/models";
import { ModelDefinition } from "../internal/iapplication";
import type { Application } from "./application";

/**
 * Get the current application
 */
export function useApplication<T extends Application = Application>(): T {
  return useInstanceStorage().application as T; // Ensure we are in a instance storage context
}
/**
 * Set the current application
 *
 * @param application
 */
export function setApplication(application: Application) {
  useInstanceStorage().application = application;
}

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
  return useApplication().getModelId(object);
}
