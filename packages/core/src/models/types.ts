import type { ModelMetadata, ModelGraphBinaryDefinition } from "@webda/compiler";
import type { Model, ModelClass } from "@webda/models";
import type { OmitByTypeRecursive } from "@webda/tsc-esm";
import type { HttpMethodType } from "../contexts/httpcontext.js";
import type { IContextAware } from "../contexts/icontext.js";

/**
 * Add the @webda/core metadata on models
 */
export type ModelDefinition<T extends Model = Model> = ModelClass<T> & { Metadata: ModelMetadata };

/**
 * Expose parameters for the model
 */
export interface ExposeParameters {
  /**
   * If model have parent but you still want it to be exposed as root
   * in domain-like service: DomainService, GraphQL
   *
   * It would create alias for the model in the root too
   */
  root?: boolean;
  /**
   * You can select to not expose some methods like create, update, delete, get, query
   */
  restrict: {
    /**
     * Create a new object
     */
    create?: boolean;
    /**
     * Update an existing object
     *
     * Includes PUT and PATCH
     */
    update?: boolean;
    /**
     * Query the object
     */
    query?: boolean;
    /**
     * Get a single object
     */
    get?: boolean;
    /**
     * Delete an object
     */
    delete?: boolean;
  };
}

/**
 * Reference to a user model
 */
export interface IUser extends Model {
  /**
   * Get the user email
   */
  getEmail(): string | undefined;
}

/**
 * Define a object that can define permission on attribute level
 */
export interface IAttributeLevelPermissionModel extends IContextAware {
  attributePermission(attribute: string | symbol, value: any, action: "READ" | "WRITE"): any;
}

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
 * Raw model without methods
 *
 * This is used to represent a model without methods and stripping out the helper methods
 */
export type RawModel<T extends object> = Partial<
  OmitByTypeRecursive<Omit<T, "__dirty" | "Events" | "__type" | "__types" | "_new" | "context">, Function>
>;

export type { ModelGraphBinaryDefinition } from "@webda/compiler";
