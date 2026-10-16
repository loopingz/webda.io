import { AsyncLocalStorage } from "node:async_hooks";
import { GlobalContext } from "./globalcontext.js";
import { Context, IContextAware, setContextUpdate } from "./icontext.js";
import { OperationContext } from "./operationcontext.js";

const globalContext = new GlobalContext();
// Test are transpiling and creating several instances of 'instancestorage.ts'
process["webdaContexts"] ??= new AsyncLocalStorage<{ context: Context; previousContext: Context }>();
const storage = process["webdaContexts"];
/**
 * Get current execution context
 * @returns the result
 */
export function useContext<T extends Context>(): T {
  return <T>(storage.getStore()?.context || globalContext);
}

/**
 * Shortcut to get the current user
 * @returns the result
 */
export function useCurrentUser() {
  return useContext().getCurrentUser();
}

/**
 * Shortcut to get the current user id
 * @returns the result
 */
export function useCurrentUserId() {
  return useContext().getCurrentUserId();
}

/**
 * Used to update model context
 *
 * @param models - the models
 * @param context - the execution context
 */
function attachModels(models: any[], context: Context) {
  setContextUpdate(true);
  models.forEach(m => (m.context = context));
  setContextUpdate(false);
}

/**
 * Run this function as system
 *
 * @param run - the function to run
 * @param attach - whether to attach to current context
 * @returns the list of results
 */
export function runAsSystem<T>(run: () => T, attach: IContextAware[] = []): T {
  return runWithContext(globalContext, run, attach);
}
/**
 * Run this function as user
 * @param context - the execution context
 * @param run - the function to run
 * @param attach - whether to attach to current context
 * @returns the list of results
 */
export function runWithContext<T>(context: Context, run: () => T, attach: IContextAware[] = []): T {
  const previousContext = storage.getStore()?.context;
  attachModels(attach, context);
  const res = storage.run({ context, previousContext }, run);
  // Manage both promise and normal
  if (res instanceof Promise) {
    // Return the .finally() promise so the rejection is not left dangling.
    // Without this, .finally() creates a derived promise that rejects
    // (when `run` rejects) with no handler, causing unhandled rejections.
    return res.finally(() => attachModels(attach, undefined)) as T;
  } else {
    attachModels(attach, undefined);
  }
  return res;
}

/**
 * Return whether the current execution context is in dry-run mode
 * @returns true if dry run is active
 */
export function useDryRun(): boolean {
  try {
    const ctx = useContext();
    return ctx?.getExtension?.("dryRun") === true || ctx?.getExtension?.("requestedDryRun") === true;
  } catch {
    return false;
  }
}

/**
 * Execute a function within a dry-run context
 * @param fn - the function to execute
 * @param context - optional context to use
 * @returns the result of fn
 */
export function runDryRun<T>(fn: () => T, context?: Context): T {
  let ctx = context ?? (storage.getStore()?.context as any);
  if (!ctx || typeof ctx.setExtension !== "function") {
    ctx = new OperationContext();
    ctx.setExtension("requestedDryRun", true);
    ctx.setExtension("dryRun", true);
    return runWithContext(ctx, fn);
  }
  ctx.setExtension("requestedDryRun", true);
  ctx.setExtension("dryRun", true);
  if (context) {
    return runWithContext(context, fn);
  }
  return fn();
}
