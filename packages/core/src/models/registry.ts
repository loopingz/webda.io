import { type Model, type PrimaryKeyType, type Repository, type SelfJSONed, type Settable, useRepository, UuidModel } from "@webda/models";
import { useLog } from "@webda/workout";

/**
 * Specific type for registry
 */
export class RegistryEntry extends UuidModel {
  constructor(data?: Settable<RegistryEntry>) {
    super(data);
    Object.assign(this, data);
  }

  /**
   * Registry entries are not serializable to DTO
   * @returns the result
   */
  toDTO(): undefined {
    return undefined;
  }

  /**
   * No-op DTO deserialization for registry entries
   * @returns this for chaining
   */
  fromDTO(): this {
    return this;
  }

  /**
   * Remove an attribute from the registry
   * @param uuid - the unique identifier
   * @param attribute - the attribute name
   * @returns the result
   */
  static async removeAttribute(uuid: string, attribute: string) {
    // @ts-ignore
    return await RegistryEntry.ref(uuid).removeAttribute(<any>attribute);
  }

  /**
   * Set an attribute from the registry
   * @param uuid - the unique identifier
   * @param attribute - the attribute name
   * @param value - the value to set
   * @returns the result
   */
  static async setAttribute(uuid: string, attribute: string, value: any) {
    // @ts-ignore
    return await RegistryEntry.ref(uuid).setAttribute(<any>attribute, value);
  }

  /**
   * Helper for upsert
   * @param uuid - the unique identifier
   * @param data - the data to process
   * @returns the result
   */
  static async get<K = any>(uuid: string, data?: K): Promise<RegistryEntry & K> {
    return data
      ? <any>await RegistryEntry.ref(uuid).upsert(<any>data)
      : <K & RegistryEntry>await RegistryEntry.ref(uuid).get();
  }

  /**
   * Helper for upsert
   * @param uuid - the unique identifier
   * @param data - the data to process
   * @returns the result
   */
  static async put<K = any>(uuid: string, data: K): Promise<K & RegistryEntry> {
    return <any>await RegistryEntry.ref(uuid).upsert(<any>data);
  }

  /**
   * Delete a registry entry by UUID
   * @param uuid - the unique identifier
   * @returns the result
   */
  static async delete(uuid: string) {
    return await RegistryEntry.ref(uuid).delete();
  }

  /**
   * Check if a registry entry exists
   * @param uuid - the unique identifier
   * @returns the result
   */
  static exists(uuid: string) {
    return RegistryEntry.ref(uuid).exists();
  }

  /**
   * Perform a conditional patch
   * @param uuid - the unique identifier
   * @param patch - the patch to apply
   * @param conditionField - the condition field name
   * @param conditionValue - the condition value
   * @returns the result
   */
  static patch(uuid: string, patch: any, conditionField: string, conditionValue: any) {
    // @ts-ignore
    return RegistryEntry.ref(uuid).patch(patch, <any>conditionField, conditionValue);
  }
}

/**
 * Use the registry
 * @returns the result
 */
export function useRegistry() {
  return RegistryEntry;
}
