import * as WebdaError from "../errors/errors.js";
import type { OperationAuthorizer } from "../core/operations.js";
import { scopeMatches } from "../session/scope.js";

/** The bearer token scope does not cover the operation (403, RFC 6750 `insufficient_scope`) */
export class InsufficientScope extends WebdaError.Forbidden {
  /** OAuth error code */
  code = "insufficient_scope";
  /**
   * @param operation - refused operation
   */
  constructor(public operation: string) {
    super(`Token scope does not cover ${operation}`);
    this.details = { error: "insufficient_scope", operation };
  }
}

/**
 * Refuse operations outside the session's token scope; sessions without scopes are unrestricted
 * @param context - calling context
 * @param operationId - operation being called
 * @param _operation - operation definition (unused)
 * @param root0 - authorizer options
 * @param root0.probe - true when only checking visibility: return a reason instead of throwing
 * @returns true or throws
 */
export const scopeAuthorizer: OperationAuthorizer = async (context, operationId, _operation, { probe }) => {
  const scopes = context.getSession()?.scopes;
  if (scopes === undefined || scopeMatches(scopes, operationId)) return true;
  if (probe) return "insufficient_scope";
  throw new InsufficientScope(operationId);
};
