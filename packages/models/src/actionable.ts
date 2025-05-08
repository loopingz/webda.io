import { FunctionArgs, FunctionReturn } from "@webda/tsc-esm";

/**
 * An Actionable object is an object that can be converted to a DTO and back
 */
export interface Actionable {
  toDTO(): any;
  fromDTO(dto: any): void;
}

/**
 * Deactivate actions of a class
 */
export type DeactivateActions<T, U extends ActionsEnum<T> = ActionsEnum<T>> = {
  [K in keyof T as K extends U ? never : K]: T[K];
} & {
  [K in keyof T as K extends U ? K : never]: T[K] extends (...args: any[]) => infer R
    ? (...args: FunctionArgs<T[K]>) => FunctionReturn<T[K]>
    : T[K];
};

/**
 * Define a Function as an Action
 */
export type Action = Function & {
  description: string;
  action: true;
};

/**
 * Wraps a function and adds a description to it and a property `action` set to true.
 *
 * You can disable actions defined by an attribute by used `DeactivateActions`
 * @param action
 * @param description
 * @returns
 */
export function ActionWrapper<T extends (...args: any[]) => any>(
  action: T,
  description: string
): T & { description: string; action: true } {
  const actionWrapped = action as T & { description: string; action: true };
  actionWrapped.description = description;
  actionWrapped.action = true;
  return actionWrapped;
}

/**
 * Call the super action of a class
 * @param target
 * @param action
 * @param args
 * @returns
 */
export function ActionSuper(target: any, action: string, ...args: any[]): any {
  return new (Object.getPrototypeOf(Object.getPrototypeOf(target).constructor))(this)[action](...args);
}

/**
 * Find all actions defined in a class
 *
 * You can disable actions defined by an attribute by used `DeactivateActions`
 */
export type ActionsEnum<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends Action
          ? K
          : T[K] extends Actionable
            ? `${K}.${ActionsEnum<T[K]>}`
            : never
        : never;
    }[keyof T]
  : never;
