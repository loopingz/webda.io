import { Configuration } from "../application/iconfiguration.js";
import { OperationDefinitionInfo } from "./icore.js";
import { ContextProvider } from "../contexts/icontext.js";
import { IRouter } from "../rest/irest.js";
import type { Application } from "../application/application.js";
import type { Core } from "./core.js";
export type InstanceStorage = Partial<{
    application: Application;
    operations: {
        [key: string]: OperationDefinitionInfo;
    };
    core: Core;
    contextProviders: ContextProvider[];
    caches?: any;
    router: IRouter;
    interruptables: Set<{
        cancel: () => Promise<void>;
    }>;
}>;
export declare function useInstanceStorage(): InstanceStorage;
export declare function runWithInstanceStorage(instanceStorage: InstanceStorage, fn: any): any;
/**
 * Create a hook that is present in the instance storage
 * @param hookName
 * @returns
 */
export declare function createCoreHook<K extends keyof InstanceStorage>(hookName: K): [<T extends InstanceStorage[K]>() => T, (value: InstanceStorage[K]) => void];
type ReservedInstance = keyof InstanceStorage;
/**
 * Create a custom hook that is not reserved
 * @param hookName
 * @returns
 */
export declare function createHook<T extends string>(hookName: T & Exclude<T, ReservedInstance>): [() => T, (value: T) => void];
export declare function registerInteruptableProcess(process: {
    cancel: () => Promise<void>;
}): void;
export declare function unregisterInteruptableProcess(process: {
    cancel: () => Promise<void>;
}): void;
export declare function useParameters(): Configuration["parameters"];
export {};
//# sourceMappingURL=instancestorage.d.ts.map