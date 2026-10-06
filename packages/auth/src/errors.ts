import { WebdaError } from "@webda/core";
export { InvalidIdent, PasswordPolicyError, TokenInvalid } from "@webda/core";

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

/** Too many attempts (429) */
export class Throttled extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Too many attempts") {
    super(message, 429);
  }
}

/** The email domain is not allowed for this provider (403) */
export class EmailDomainNotAllowed extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Email domain not allowed") {
    super(message, 403);
  }
}
