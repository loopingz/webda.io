import type { JSONSchema7 } from "json-schema";
import type { HttpMethodType } from "../contexts/httpcontext";
import type { ModelGraph, ModelsTree } from "../application/iapplication";

/**
 * Define an Action on a model
 *
 * It is basically a method designed to be called by the API or external
 * systems
 */
export interface ModelAction {
  /**
   * Method for the route
   *
   * By default ["PUT"]
   */
  methods?: HttpMethodType[];
  /**
   * Define if the action is global or per object
   *
   * The method that implement the action must be called
   * `_${actionName}`
   */
  global?: boolean;
  /**
   * Additional openapi info
   */
  openapi?: any;
  /**
   * Method of the action
   */
  method?: string;
}

/**
 * Define an export of actions from Model
 */
export type ModelActions = {
  [key: string]: ModelAction;
};

/**
 * Expose CoreModel reflective methods
 */
export interface Reflection {
  /**
   * Get the model actions
   */
  getActions(): { [key: string]: ModelAction };
  /**
   * Get the model schema
   */
  getSchema(): JSONSchema7;

  /**
   * Get the model hierarchy
   */
  getHierarchy(): { ancestors: string[]; children: ModelsTree };
  /**
   * Get the model relations
   */
  getRelations(): ModelGraph;
  /**
   * Get Model identifier
   */
  getIdentifier(short?: boolean): string;
}
/**
 * Raw model without methods
 *
 * This is used to represent a model without methods and stripping out the helper methods
 */
export type RawModel<T extends object> = {
  [K in keyof Omit<Attr<T>, "Events">]?: T[K] extends object ? RawModel<T[K]> : T[K];
};

type Attr<T> = {
  [K in keyof T]?: T[K] extends Function ? never : K;
};
