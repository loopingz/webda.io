import { HttpError } from "./errors.js";

/** Too many attempts (429) */
export class Throttled extends HttpError {
  /**
   * Create a new Throttled instance
   * @param message - error message
   */
  constructor(message: string = "Too many attempts") {
    super(message, 429);
  }
}

/** The MFA code is invalid or already used (401) */
export class InvalidMfaCode extends HttpError {
  /**
   * Create a new InvalidMfaCode instance
   * @param message - error message
   */
  constructor(message: string = "Invalid MFA code") {
    super(message, 401);
  }
}

/** MFA is not enabled, or not with this method (400) */
export class MfaNotEnabled extends HttpError {
  /**
   * Create a new MfaNotEnabled instance
   * @param message - error message
   */
  constructor(message: string = "MFA is not enabled") {
    super(message, 400);
  }
}

/** MFA is already enabled with this method (409) */
export class MfaAlreadyEnabled extends HttpError {
  /**
   * Create a new MfaAlreadyEnabled instance
   * @param message - error message
   */
  constructor(message: string = "MFA is already enabled") {
    super(message, 409);
  }
}

/** The operation requires a second factor and the session has none enrolled (403) */
export class MfaRequired extends HttpError {
  /**
   * Create a new MfaRequired instance
   * @param message - error message
   */
  constructor(message: string = "MFA is required") {
    super(message, 403);
  }
}

/**
 * The second factor was verified too long ago for the operation (401): verify it again (step-up) and retry.
 * `details.maxAge` is the freshness the operation requires, in seconds
 */
export class MfaStepUpRequired extends HttpError {
  /**
   * Details
   */
  declare details: { maxAge: number };
  /**
   * Create a new MfaStepUpRequired instance
   * @param maxAge - required freshness in seconds
   * @param message - error message
   */
  constructor(maxAge: number, message: string = "MFA step-up required") {
    super(message, 401, { maxAge });
  }
}
