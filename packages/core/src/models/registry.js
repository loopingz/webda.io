import { UuidModel } from "@webda/models";
/**
 * Specific type for registry
 */
export class RegistryEntry extends UuidModel {
    constructor(data) {
        super(data);
        Object.assign(this, data);
    }
    toDTO() {
        return undefined;
    }
    fromDTO() {
        return this;
    }
    /**
     * Remove an attribute from the registry
     * @param uuid
     * @param attribute
     * @returns
     */
    static async removeAttribute(uuid, attribute) {
        // @ts-ignore
        return await RegistryEntry.ref(uuid).removeAttribute(attribute);
    }
    /**
     * Set an attribute from the registry
     * @param uuid
     * @param attribute
     * @returns
     */
    static async setAttribute(uuid, attribute, value) {
        // @ts-ignore
        return await RegistryEntry.ref(uuid).setAttribute(attribute, value);
    }
    /**
     * Helper for upsert
     * @param uuid
     * @param data
     * @returns
     */
    static async get(uuid, data) {
        return data
            ? await RegistryEntry.ref(uuid).upsert(data)
            : await RegistryEntry.ref(uuid).get();
    }
    /**
     * Helper for upsert
     * @param uuid
     * @param data
     * @returns
     */
    static async put(uuid, data) {
        return await RegistryEntry.ref(uuid).upsert(data);
    }
    static async delete(uuid) {
        return await RegistryEntry.ref(uuid).delete();
    }
    static exists(uuid) {
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
    static patch(uuid, patch, conditionField, conditionValue) {
        // @ts-ignore
        return RegistryEntry.ref(uuid).patch(patch, conditionField, conditionValue);
    }
}
/**
 * Use the registry
 * @returns
 */
export function useRegistry() {
    return RegistryEntry;
}
//# sourceMappingURL=registry.js.map