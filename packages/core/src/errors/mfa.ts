import { HttpError } from "./errors.js";

/** Too many attempts (429) */
export class Throttled extends HttpError {
  /** @param message - error message */
  constructor(message: string = "Too many attempts") {
    super(message, 429);
  }
}

/** The MFA code is invalid or already used (401) */
export class InvalidMfaCode extends HttpError {
  /** @param message - error message */
  constructor(message: string = "Invalid MFA code") {
    super(message, 401);
  }
}

/** MFA is not enabled, or not with this method (400) */
export class MfaNotEnabled extends HttpError {
  /** @param message - error message */
  constructor(message: string = "MFA is not enabled") {
    super(message, 400);
  }
}

/** MFA is already enabled with this method (409) */
export class MfaAlreadyEnabled extends HttpError {
  /** @param message - error message */
  constructor(message: string = "MFA is already enabled") {
    super(message, 409);
  }
}
