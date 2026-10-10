import { listOperationAuthorizers } from "@webda/core";

/**
 * Marker property set on the IAMService authorizer
 */
export const IAM_AUTHORIZER = Symbol("IAMAuthorizer");

/**
 * @returns true while an IAMService authorizer is registered in the current instance
 */
export function isIAMActive(): boolean {
  return listOperationAuthorizers().some(authorizer => (authorizer as any)[IAM_AUTHORIZER] === true);
}
