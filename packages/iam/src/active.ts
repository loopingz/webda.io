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
