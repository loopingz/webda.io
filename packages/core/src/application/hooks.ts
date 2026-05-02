import { useInstanceStorage } from "../core/instancestorage.js";
import type { Configuration } from "./iconfiguration.js";
import type { Model } from "@webda/models";
import { ModelDefinition } from "../models/types.js";
import type { Application } from "./application.js";

/**
 * Get the current application
 * @returns the result
 */
export function useApplication<T extends Application = Application>(): T {
  return useInstanceStorage().application as T; // Ensure we are in a instance storage context
}
/**
 * Set the current application
 *
 * @param application - the application instance
 */
export function setApplication(application: Application) {
  useInstanceStorage().application = application;
}

/**
 * Useful if you want to allow model override
 * @param name - the name to use
 * @returns the result
 */
export function useModel<T extends Model = Model>(name: string | T): ModelDefinition<T> {
  if (name === undefined) {
    throw new Error("Cannot call useModel with undefined");
  }
  if (typeof name === "string") {
    return <ModelDefinition<T>>useApplication().getModel(name);
  }
  // An instance or a class. `getModelId` accepts either and resolves to the
  // string identifier (e.g. "WebdaSample/Post"). The previous path passed
  // `name.constructor` directly to `getModel`, which expects a string —
  // `completeNamespace(name).includes("/")` then crashed with
  // `name.includes is not a function` because the constructor isn't a
  // string.
  const id = useApplication().getModelId(name as any);
  if (!id) {
    throw new Error(`Cannot resolve model identifier from ${name}`);
  }
  return <ModelDefinition<T>>useApplication().getModel(id);
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

/**
 * Get the current application parameters from the active configuration
 * @returns the result
 */
export function useParameters(): Configuration["parameters"] {
  return useApplication().getConfiguration().parameters;
}
