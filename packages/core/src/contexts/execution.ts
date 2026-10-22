import { Context } from "./icontext.js";
import { OperationContext } from "./operationcontext.js";
import { runWithContext, useContext } from "./contextstorage.js";

export * from "./contextstorage.js";

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
  let ctx = context ?? (useContext() as any);
  if (!ctx || ctx.isGlobalContext() || typeof ctx.setExtension !== "function") {
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
