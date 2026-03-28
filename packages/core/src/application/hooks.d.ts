import type { Model } from "@webda/models";
import { ModelDefinition } from "../models/types.js";
import type { Application } from "./application.js";
/**
 * Get the current application
 */
export declare function useApplication<T extends Application = Application>(): T;
/**
 * Set the current application
 *
 * @param application
 */
export declare function setApplication(application: Application): void;
/**
 * Useful if you want to allow model override
 * @param name
 * @returns
 */
export declare function useModel<T extends Model = Model>(name: string | T): ModelDefinition<T>;
/**
 * Get the model id for an object in the application
 *
 * @param object instance or class
 * @returns The model identifier or undefined if not found, e.g. "User" or "Webda/User"
 */
export declare function useModelId(object: any): string | undefined;
//# sourceMappingURL=hooks.d.ts.map