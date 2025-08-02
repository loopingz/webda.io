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
  isExposed?: () => boolean | undefined | "create" | "get" | "update" | "delete"[];
}

/**
 * Get the root models (model that should be defined)
 */
const rootModels: WeakSet<ModelPrototype> = new WeakSet<ModelPrototype>();

/**
 * Expose annotation to declare which object should be exposed through API
 */
function Expose() {}
