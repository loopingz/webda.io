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
  // Used to store the configuration
  configuration: Configuration;
  // Used to store the core
  core: ICore;
  // Used to store the context providers
  contextProviders: ContextProvider[];
  // Used to store caches
  caches: { [key: string]: any };
  // Used to store the router
  router: IRouter;
}>;

const storage = new AsyncLocalStorage<InstanceStorage>();

export function useInstanceStorage(): InstanceStorage {
  return storage.getStore();
}

export function useConfiguration(): Configuration {
  return useInstanceStorage().configuration;
}

export function useParameters(name?: string): Configuration["parameters"] {
  // TODO: Implement deepmerge
  const configuration = useConfiguration();
  const params = {
    ...configuration.parameters,
    ...(name ? configuration.services[name] || {} : {})
  };
  return params;
}

export function runWithInstanceStorage(instanceStorage: InstanceStorage = {}, fn) {
  return storage.run(instanceStorage, fn);
}

/**
 * Create a hook that is present in the instance storage
 * @param hookName
 * @returns
 */
export function createCoreHook<K extends keyof InstanceStorage>(
  hookName: K
): [() => InstanceStorage[K], (value: InstanceStorage[K]) => void] {
  return [
    () => useInstanceStorage()[hookName],
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
