import { AsyncLocalStorage } from "node:async_hooks";
import { GlobalContext } from "./globalcontext.js";
import { Context, IContextAware, setContextUpdate } from "./icontext.js";

const globalContext = new GlobalContext();
// Test are transpiling and creating several instances of 'instancestorage.ts'
process["webdaContexts"] ??= new AsyncLocalStorage<{ context: Context; previousContext: Context }>();
const storage = process["webdaContexts"];
/**
 * Get current execution context
 */
export function useContext<T extends Context>(): T {
  return <T>(storage.getStore()?.context || globalContext);
}

/**
 * Shortcut to get the current user
 * @returns
 */
export function useCurrentUser() {
  return useContext().getCurrentUser();
}

/**
 * Shortcut to get the current user id
 * @returns
 */
export function useCurrentUserId() {
  return useContext().getCurrentUserId();
}

/**
 * Used to update model context
 *
 * @param models
 * @param context
 */
function attachModels(models: any[], context: Context) {
  setContextUpdate(true);
  models.forEach(m => (m.context = context));
  setContextUpdate(false);
}

/**
 * Run this function as system
 *
 * @param run
 * @returns
 */
export function runAsSystem<T>(run: () => T, attach: IContextAware[] = []): T {
  return this.runWithContext(globalContext, run, attach);
}
/**
 * Run this function as user
 * @param context
 * @param run
 * @returns
 */
export function runWithContext<T>(context: Context, run: () => T, attach: IContextAware[] = []): T {
  const previousContext = storage.getStore()?.context;
  attachModels(attach, context);
  const res = storage.run({ context, previousContext }, run);
  // Manage both promise and normal
  if (res instanceof Promise) {
    res.finally(() => attachModels(attach, undefined));
  } else {
    attachModels(attach, undefined);
  }
  return res;
}
