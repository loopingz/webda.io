import { WebdaError } from "@webda/core";

/**
 * The presented OIDC token is not valid for this application
 */
export class OIDCTokenInvalid extends WebdaError.HttpError {
  /**
   * @param message - the reason, never the token
   */
  constructor(message: string) {
    super(message, 401);
  }
}

/**
 * The OIDC services are misconfigured
 */
export class OIDCConfigurationError extends WebdaError.CodeError {
  /**
   * @param message - the problem
   */
  constructor(message: string) {
    super("OIDC_CONFIGURATION", message);
  }
}

/**
 * A token source could not provide a token
 */
export class OIDCTokenSourceError extends WebdaError.CodeError {
  /**
   * @param message - the problem
   */
  constructor(message: string) {
    super("OIDC_TOKEN_SOURCE", message);
  }
}
