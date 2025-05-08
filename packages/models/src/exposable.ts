import { ActionsEnum } from "./actionable";

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
}
