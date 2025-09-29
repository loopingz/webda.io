import { Model, PrimaryKeyType, Repository, SelfJSONed, useRepository, UuidModel } from "@webda/models";
import { useLog } from "@webda/workout";

/**
 * Specific type for registry
 */
export class RegistryEntry extends UuidModel {
  toDTO(): undefined {
    return undefined;
  }
  fromDTO(): this {
    return this;
  }
  toJSON(): SelfJSONed<this> {
    useLog("TRACE", "RegistryEntry toJSON");
    console.log("toJSON, RegistryEntry");
    return this as SelfJSONed<this>;
  }

  deserialize(data: Partial<SelfJSONed<Model>>): this {
    Object.assign(this, data);
    return this;
  }

  /**
   * Remove an attribute from the registry
   * @param uuid
   * @param attribute
   * @returns
   */
  static async removeAttribute(uuid: string, attribute: string) {
    // @ts-ignore
    return await RegistryEntry.ref(uuid).removeAttribute(<any>attribute);
  }

  /**
   * Set an attribute from the registry
   * @param uuid
   * @param attribute
   * @returns
   */
  static async setAttribute(uuid: string, attribute: string, value: any) {
    // @ts-ignore
    return await RegistryEntry.ref(uuid).setAttribute(<any>attribute, value);
  }

  /**
   * Helper for upsert
   * @param uuid
   * @param data
   * @returns
   */
  static async get<K = any>(uuid: string, data?: K): Promise<RegistryEntry & K> {
    console.log("Repository", uuid, data, RegistryEntry.getRepository());
    return data
      ? <any>await RegistryEntry.ref(uuid).upsert(<any>data)
      : <K & RegistryEntry>await RegistryEntry.ref(uuid).get();
  }

  /**
   * Helper for upsert
   * @param uuid
   * @param data
   * @returns
   */
  static async put<K = any>(uuid: string, data: K): Promise<K & RegistryEntry> {
    return <any>await RegistryEntry.ref(uuid).upsert(<any>data);
  }

  static async delete(uuid: string) {
    return await RegistryEntry.ref(uuid).delete();
  }

  static exists(uuid: string) {
    return RegistryEntry.ref(uuid).exists();
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
    // @ts-ignore
    return RegistryEntry.ref(uuid).patch(patch, <any>conditionField, conditionValue);
  }
}

/**
 * Use the registry
 * @returns
 */
export function useRegistry() {
  return RegistryEntry;
}
