import { CoreModel } from "./coremodel";
import { CoreModelDefinition } from "../application/iapplication";

/**
 * Specific type for registry
 */
export class RegistryModel extends CoreModel {
  /**
   * Helper for upsert
   * @param uuid
   * @param data
   * @returns
   */
  static async put<T extends CoreModel, K = any>(this: CoreModelDefinition<T>, uuid: string, data: K) {
    return await this.ref(uuid).upsert(<any>data);
  }

  static async delete<T extends CoreModel>(this: CoreModelDefinition<T>, uuid: string) {
    return await this.ref(uuid).delete();
  }
}

/**
 * Type helper for registry entry
 */

//export type RegistryEntry<T = any> = RegistryModel & T;

export class RegistryEntry {
  /**
   * Remove an attribute from the registry
   * @param uuid
   * @param attribute
   * @returns
   */
  static async removeAttribute(uuid: string, attribute: string) {
    return await RegistryModel.ref(uuid).removeAttribute(<any>attribute);
  }
  /**
   * Helper for upsert
   * @param uuid
   * @param data
   * @returns
   */
  static async get<K = any>(uuid: string, data?: K): Promise<RegistryModel & K> {
    return data ? <any>await RegistryModel.ref(uuid).upsert(<any>data) : await RegistryModel.ref(uuid).get();
  }

  /**
   * Helper for upsert
   * @param uuid
   * @param data
   * @returns
   */
  static async put<K = any>(uuid: string, data: K): Promise<K & RegistryModel> {
    return <any>await RegistryModel.ref(uuid).upsert(<any>data);
  }

  static async delete(uuid: string) {
    return await RegistryModel.ref(uuid).delete();
  }

  static exists(uuid: string) {
    return RegistryModel.ref(uuid).exists();
  }

  /**
   * Perform a conditional patch
   * @param uuid
   * @param patch
   * @param conditionField
   * @param conditionValue
   * @returns
   */
  static patch(uuid: string, patch: any, conditionField: string, conditionValue: any) {
    return RegistryModel.ref(uuid).patch(patch, <any>conditionField, conditionValue);
  }
}

/**
 * Use the registry
 * @returns
 */
export function useRegistry() {
  return RegistryEntry;
}
