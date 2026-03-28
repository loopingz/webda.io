import { Settable, UuidModel } from "@webda/models";
/**
 * Specific type for registry
 */
export declare class RegistryEntry extends UuidModel {
    constructor(data?: Settable<RegistryEntry>);
    toDTO(): undefined;
    fromDTO(): this;
    /**
     * Remove an attribute from the registry
     * @param uuid
     * @param attribute
     * @returns
     */
    static removeAttribute(uuid: string, attribute: string): Promise<void>;
    /**
     * Set an attribute from the registry
     * @param uuid
     * @param attribute
     * @returns
     */
    static setAttribute(uuid: string, attribute: string, value: any): Promise<void>;
    /**
     * Helper for upsert
     * @param uuid
     * @param data
     * @returns
     */
    static get<K = any>(uuid: string, data?: K): Promise<RegistryEntry & K>;
    /**
     * Helper for upsert
     * @param uuid
     * @param data
     * @returns
     */
    static put<K = any>(uuid: string, data: K): Promise<K & RegistryEntry>;
    static delete(uuid: string): Promise<void>;
    static exists(uuid: string): Promise<boolean>;
    /**
     * Perform a conditional patch
     * @param uuid
     * @param patch
     * @param conditionField
     * @param conditionValue
     * @returns
     */
    static patch(uuid: string, patch: any, conditionField: string, conditionValue: any): Promise<void>;
}
/**
 * Use the registry
 * @returns
 */
export declare function useRegistry(): typeof RegistryEntry;
//# sourceMappingURL=registry.d.ts.map