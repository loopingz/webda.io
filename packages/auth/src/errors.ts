import { WebdaError } from "@webda/core";
// MFA errors and Throttled live in core: the MFA behavior raises them on any model
export {
  InvalidIdent,
  InvalidMfaCode,
  MfaAlreadyEnabled,
  MfaNotEnabled,
  MfaRequired,
  MfaStepUpRequired,
  PasswordPolicyError,
  Throttled,
  TokenInvalid
} from "@webda/core";

/** An account already owns this email; log in to link (409) */
export class AccountExists extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Account exists, log in to link") {
    super(message, 409);
  }
}

/** The ident is already linked to another user (409) */
export class IdentLinkedElsewhere extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Ident is linked to another user") {
    super(message, 409);
  }
}

/** A v3 ident upgrades to a key another user already holds; resolve it manually (409) */
export class IdentConflict extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Upgraded ident key already belongs to another user") {
    super(message, 409);
  }
}

/** The last login method cannot be removed (409) */
export class LastLoginMethod extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Cannot remove the last login method") {
    super(message, 409);
  }
}

/** Credentials are invalid (403) */
export class InvalidCredentials extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Invalid credentials") {
    super(message, 403);
  }
}

/** Registration is disabled (403) */
export class RegistrationDisabled extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Registration is disabled") {
    super(message, 403);
  }
}

/** The token has expired (410) */
export class TokenExpired extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Expired token") {
    super(message, 410);
  }
}

/** The email domain is not allowed for this provider (403) */
export class EmailDomainNotAllowed extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Email domain not allowed") {
    super(message, 403);
  }
}

/** The request body must be JSON (415) */
export class UnsupportedMediaType extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Content-Type must be application/json") {
    super(message, 415);
  }
}

/** Session is not awaiting second-factor verification (401) */
export class MfaNotPending extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "MFA verification is not pending") {
    super(message, 401);
  }
}

/** The phone number is not a valid E.164 number (400) */
export class InvalidPhone extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Phone number must be in E.164 format, e.g. +15550100089") {
    super(message, 400);
  }
}
