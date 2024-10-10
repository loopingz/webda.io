import { AsyncLocalStorage } from "async_hooks";
import { IApplication, Configuration } from "../application/iapplication";
import { OperationDefinitionInfo, ICore } from "./icore";
import { ContextProvider } from "../contexts/icontext";
import { IRouter } from "../rest/irest";

type InstanceStorage = Partial<{
  // Used to store the application
  application: IApplication;
  // Used to store the operations
  operations: { [key: string]: OperationDefinitionInfo };
  // Used to store the core
  core: ICore;
  // Used to store the context providers
  contextProviders: ContextProvider[];
  // Used to store caches
  caches?: any;
  // Used to store the router
  router: IRouter;
  // Interruptable process
  interruptables: Set<{ cancel: () => Promise<void> }>;
}>;

const storage = new AsyncLocalStorage<InstanceStorage>();

export function useInstanceStorage(): InstanceStorage {
  const store = storage.getStore();
  if (!store) {
    throw new Error("Webda launched outside of a Webda context");
  }
  return store;
}

export function useConfiguration(): Configuration {
  return useInstanceStorage().application.getCurrentConfiguration();
}

export function useParameters(name?: string): Configuration["parameters"] {
  // TODO: Implement deepmerge
  const configuration = useConfiguration();
  if (configuration === undefined) {
    throw new Error("Application not initialized: cannot useParameters");
  }
  const params = {
    ...configuration.parameters,
    ...(name ? configuration.services[name] || {} : {})
  };
  return params;
}

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

export function registerInteruptableProcess(process: { cancel: () => Promise<void> }) {
  useInstanceStorage().interruptables.add(process);
}

export function unregisterInteruptableProcess(process: { cancel: () => Promise<void> }) {
  useInstanceStorage().interruptables.delete(process);
}
