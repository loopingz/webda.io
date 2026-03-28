import { Store, StoreParameters } from "./store.js";
import { ModelClass, Repository } from "@webda/models";
export interface StorageMap {
    [key: string]: string;
}
/**
 * Memory store
 */
export declare class MemoryStoreParameters extends StoreParameters {
    /**
     * Persist the data in a file
     */
    persistence?: {
        /**
         * File path to save to
         */
        path: string;
        /**
         * Encryption key for AES encryption
         */
        key?: string;
        /**
         * By default only save once every 1s if modified
         *
         * @default 1000
         */
        delay?: number;
        /**
         * cipher to use
         */
        cipher?: string;
        /**
         * Compression level to use
         * @default 9
         * @max 9
         * @min 0
         */
        compressionLevel?: number;
    };
    load(params?: any): this;
}
declare class MemoryModelMap extends Map<string, string> {
    persistence: () => void;
    set(key: string, object: string): this;
}
/**
 * Store in Memory
 *
 * @category CoreServices
 * @WebdaModda
 */
export declare class MemoryStore<K extends MemoryStoreParameters = MemoryStoreParameters> extends Store<K> {
    /**
     * Inmemory storage
     */
    storage: MemoryModelMap;
    /**
     * Persistence timeout id
     */
    private persistenceTimeout;
    /**
     * Current persistence
     */
    persistencePromise: any;
    /**
     * AES encryption key
     */
    private key;
    /**
     * Persist inmemory storage to file
     *
     * Called every this.parameters.persistence.delay ms
     *
     * We use stream to avoid consuming high memory
     * The objects are already in memory the JSON.parse/stringify would duplicate memory
     */
    persist(): Promise<void>;
    /**
     * Load a persisted memory data
     */
    load(): Promise<void>;
    /**
     * @override
     */
    init(): Promise<this>;
    /**
     * Set the persistence function if needed
     */
    setPersistence(): void;
    /**
     * Ensure the store is saved if persistence is on
     */
    stop(): Promise<void>;
    getRepository<T extends ModelClass>(model: T): Repository<T>;
}
export {};
//# sourceMappingURL=memory.d.ts.map