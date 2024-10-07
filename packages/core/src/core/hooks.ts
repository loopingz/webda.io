import { IStore, IService, OperationDefinitionInfo } from "./icore";
import { createCoreHook, useInstanceStorage } from "./instancestorage";

const [useCore, setCore] = createCoreHook("core");

export { useCore, setCore };

export function useService<T extends IService>(name: string): T {
  return <T>useCore().getService(name);
}

export function useModelStore(name: string): IStore {
  return useCore().getModelStore(name);
}
