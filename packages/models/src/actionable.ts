export const WEBDA_ACTIONS: unique symbol = Symbol("Actions definition");

/**
 * An Actionable object is an object that can be converted to a DTO and back
 */
export interface Actionable<T = any> {
  [WEBDA_ACTIONS]: T;
  toDTO(): T;
  fromDTO(dto: T): void;
}

/**
 * Return attribute actions
 */
export type AttributesActions<T extends Actionable> = {
  [K in keyof T]-?: NonNullable<T[K]> extends Actionable
    ? `${Extract<K, string>}.${OwnActions<NonNullable<T[K]>>}`
    : never;
}[keyof T];

/**
 * Return object actions
 */
export type OwnActions<T extends Actionable> = {
  [K in keyof T[typeof WEBDA_ACTIONS]]: T[typeof WEBDA_ACTIONS][K] extends { disabled: true } ? never : K;
}[keyof T[typeof WEBDA_ACTIONS]] &
  string;

/**
 * Find all actions defined in a class
 *
 */
export type ActionsEnum<T extends Actionable> = AttributesActions<T> | OwnActions<T>;

/**
 * Exposable model implement the canAct
 */
export type Exposable = {
  canAct: () => Promise<boolean | string>;
} & Actionable;

/**
 * Check if a model is exposable
 * @param model
 * @returns
 */
export function isExposable(model: any): model is Exposable {
  return typeof model.canAct === "function" && isActionable(model);
}

/**
 * Check if a model is exposable
 * @param model
 * @returns
 */
export function isActionable(model: any): model is Actionable {
  return typeof model.toDTO === "function" && typeof model.fromDTO === "function";
}
