import { AsyncLocalStorage } from "async_hooks";
import { Configuration } from "../application/iconfiguration.js";
import { OperationDefinitionInfo, ICore } from "./icore.js";
import { ContextProvider } from "../contexts/icontext.js";
import { IRouter } from "../rest/irest.js";
import type { Application } from "../application/application.js";
import type { Core } from "./core.js";

export type InstanceStorage = Partial<{
  // Used to store the application
  application: Application;
  // Used to store the operations
  operations: { [key: string]: OperationDefinitionInfo };
  // Used to store the core
  core: Core;
  // Used to store the context providers
  contextProviders: ContextProvider[];
  // Used to store caches
  caches?: any;
  // Used to store the router
  router: IRouter;
  // Interruptable process
  interruptables: Set<{ cancel: () => Promise<void> }>;
}>;

// Test are transpiling and creating several instances of 'instancestorage.ts'
process["webdaInstanceStorage"] ??= new AsyncLocalStorage<InstanceStorage>();
const storage = process["webdaInstanceStorage"];

/** Retrieve the current async-local InstanceStorage, throwing if called outside a storage context */
export function useInstanceStorage(): InstanceStorage {
  const store = storage.getStore();
  if (!store) {
    throw new Error("Webda launched outside of a InstanceStorage context");
  }
  return store;
}

/** Run a function within an async-local InstanceStorage context, merging with defaults */
export function runWithInstanceStorage(instanceStorage: InstanceStorage = {}, fn) {
  return storage.run(
    {
      application: undefined,
      operations: {},
      core: undefined,
      contextProviders: [],
      router: undefined,
      interruptables: new Set(),
      ...instanceStorage
    },
    fn
  );
}

/**
 * Create a hook that is present in the instance storage
 * @param hookName
 * @returns
 */
export function createCoreHook<K extends keyof InstanceStorage>(
  hookName: K
): [<T extends InstanceStorage[K]>() => T, (value: InstanceStorage[K]) => void] {
  return [
    () => <any>useInstanceStorage()[hookName],
    (value: InstanceStorage[K]) => {
      useInstanceStorage()[hookName] = value;
    }
  ];
}

type ReservedInstance = keyof InstanceStorage;

/**
 * Create a custom hook that is not reserved
 * @param hookName
 * @returns
 */
export function createHook<T extends string>(
  hookName: T & Exclude<T, ReservedInstance>
): [() => T, (value: T) => void] {
  return [
    () => (<any>useInstanceStorage())[hookName],
    (value: T) => {
      (<any>useInstanceStorage())[hookName] = value;
    }
  ];
}

/** Register a cancelable process so it can be interrupted on shutdown */
export function registerInteruptableProcess(process: { cancel: () => Promise<void> }) {
  useInstanceStorage().interruptables.add(process);
}

/** Unregister a previously registered cancelable process */
export function unregisterInteruptableProcess(process: { cancel: () => Promise<void> }) {
  useInstanceStorage().interruptables.delete(process);
}

