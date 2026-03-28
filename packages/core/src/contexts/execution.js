import { AsyncLocalStorage } from "node:async_hooks";
import { GlobalContext } from "./globalcontext.js";
import { setContextUpdate } from "./icontext.js";
const globalContext = new GlobalContext();
// Test are transpiling and creating several instances of 'instancestorage.ts'
process["webdaContexts"] ?? (process["webdaContexts"] = new AsyncLocalStorage());
const storage = process["webdaContexts"];
/**
 * Get current execution context
 */
export function useContext() {
    return (storage.getStore()?.context || globalContext);
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
function attachModels(models, context) {
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
export function runAsSystem(run, attach = []) {
    return this.runWithContext(globalContext, run, attach);
}
/**
 * Run this function as user
 * @param context
 * @param run
 * @returns
 */
export function runWithContext(context, run, attach = []) {
    const previousContext = storage.getStore()?.context;
    attachModels(attach, context);
    const res = storage.run({ context, previousContext }, run);
    // Manage both promise and normal
    if (res instanceof Promise) {
        res.finally(() => attachModels(attach, undefined));
    }
    else {
        attachModels(attach, undefined);
    }
    return res;
}
//# sourceMappingURL=execution.js.map