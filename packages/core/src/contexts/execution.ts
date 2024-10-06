import { AsyncLocalStorage } from "node:async_hooks";
import { GlobalContext } from "./globalcontext";
import { Context, IContextAware, setContextUpdate } from "./icontext";

const storage = new AsyncLocalStorage<{ context: Context; previousContext: Context }>();
const globalContext = new GlobalContext();
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
  return this.runWithContext(this.globalContext, run, attach);
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
    res.then(() => this.attachModels(attach, undefined));
  } else {
    this.attachModels(attach, undefined);
  }
  return res;
}
