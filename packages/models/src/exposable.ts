import { ActionsEnum } from "./actionable";
import { ModelPrototype } from "./model";

/**
 *
 * @param obj
 * @returns
 */
export function isExposable(obj: any): obj is Exposable {
  return typeof obj.toDTO === "function" && typeof obj.fromDTO === "function";
}

export function isExposableModel(obj: any): obj is Exposable {
  return typeof obj.canAct === "function" && isExposable(obj);
}

export interface Exposable<T = any, W = T> {
  toDTO(): T;
  fromDTO(dto: W): void;
}

/**
 * Define how the model should be exposed (replace @Expose annotation from @webda < 4.0.0)
 *
 * Allow you to redefine exposure on sub-models
 */
export type ExposableMetadata<T = {}> =
  | undefined
  | boolean
  | ({
      /**
       * List of actions that are allowed
       */
      types?: ("create" | "get" | "update" | "delete" | "actions")[];
      /**
       * Redefine the plural of the model
       * @default model name in lower case + "s"
       * @example "users" for User model
       * @example "products" for Product model
       */
      plural?: string;
      /**
       * Additional metadata can be added here to configure specific Exposer: REST, GraphQL, etc.
       *
       * Example:
       * ```ts
       * {
       *   rest: {
       *     root: true,
       *   }
       * }
       * ```
       */
    } & T);

export interface ExposableModel<T = any, W = T> extends Exposable<T, W> {
  /**
   * You can disable actions defined by an attribute by used `DeactivateActions`
   * @param action
   */
  canAct(action: ActionsEnum<this>): Promise<boolean | string>;
  /**
   * Return if a model is exposed
   * @returns true if no restriction, undefined if not exposed, array of type of exposition
   */
  getConfiguration: () => { expose: ExposableMetadata };
}

/**
 * Get the root models (model that should be defined)
 */
const rootModels: WeakSet<ModelPrototype> = new WeakSet<ModelPrototype>();
