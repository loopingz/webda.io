import { listOperationAuthorizers } from "@webda/core";

/**
 * Marker property set on the IAMService authorizer: a function reporting whether its policies are loaded
 */
export const IAM_AUTHORIZER = Symbol("IAMAuthorizer");

/**
 * @returns true while a registered IAMService authorizer has its policies loaded (initialized and not stopped)
 */
export function isIAMActive(): boolean {
  return listOperationAuthorizers().some(authorizer => {
    const live = (authorizer as any)[IAM_AUTHORIZER];
    return typeof live === "function" && live() === true;
  });
}

/**
 * Context extension set by the IAMService authorizer to the operation id of an IAM model operation it allowed
 */
export const IAM_ALLOWED_OPERATION = "iamAllowedOperation";

/**
 * The part of an operation context read by {@link canActInIAMOperation}
 */
export type IAMExtensionContext = { getExtension?<K = any>(name: string): K };

/**
 * Static `canAct` of the IAM models: their operations are decided by the IAMService authorizer, so an action is
 * allowed only inside an operation that authorizer allowed
 *
 * Paths that consult the model permission without dispatching an operation (e.g. GraphQL CRUD) carry no IAM decision
 * and are refused, whatever the caller.
 * @param context - the caller context
 * @returns true when IAM is running and allowed the context's current operation, otherwise the refusal reason
 */
export function canActInIAMOperation(context?: IAMExtensionContext): true | string {
  if (!isIAMActive()) {
    return "IAMService is not running";
  }
  const operation = context?.getExtension?.<string>("operation");
  if (typeof operation !== "string" || context.getExtension<string>(IAM_ALLOWED_OPERATION) !== operation) {
    return "IAM models are only accessible through an operation allowed by the IAMService";
  }
  return true;
}
