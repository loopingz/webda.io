import { Core } from "./core";
import { CoreModel } from "./models/coremodel";
import { Service } from "./services/service";
import { Context } from "./utils/context";

/**
 * Get current execution context
 */
export function useContext<T extends Context>(): T {
  return Core.get().getContext<T>();
}

/**
 * Get a webda service
 * @returns
 */
export function useService<T extends Service>(name: string): T {
  return Core.get().getService<T>(name);
}

/**
 * Get the current core
 * @returns
 */
export function useCore(): Core {
  return Core.get();
}

/**
 * Run within the system user
 * @param runner
 * @returns
 */
export function runAsSystem<T>(runner: () => T, attach?: CoreModel[]): T {
  return Core.get().runAsSystem(runner, attach);
}

/**
 * Run within a specific context
 * @param context
 * @param runner
 * @returns
 */
export function runInContext<T>(context: Context, runner: () => T, attach?: CoreModel[]): T {
  return Core.get().runInContext(context, runner, attach);
}

/**
 * Use the registry
 * @returns
 */
export function useRegistry() {
  return Core.get().getRegistry();
}

/**
 * Use the crypto service
 * @returns
 */
export function useCrypto() {
  return Core.get().getCrypto();
}

/**
 * Retrieve parameters from webda
 * @param serviceName
 * @returns
 */
export function useParams(serviceName?: string) {
  return serviceName ? Core.get().getServiceParams(serviceName) : Core.get().getGlobalParams();
}
