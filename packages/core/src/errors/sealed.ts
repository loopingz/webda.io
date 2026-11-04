import { HttpError } from "./errors.js";

/** The recipient of a sealed value has no usable public key: unknown user, or no active key (412) */
export class SealedKeyMissingError extends HttpError {
  /** @param message - error message */
  constructor(message: string = "Recipient has no public key") {
    super(message, 412);
  }
}

/**
 * Malformed sealed envelope or key (400)
 *
 * HTTP counterpart of the isomorphic `SealedFormatError` of `src/sealed/` (which cannot depend on core): server code
 * maps the isomorphic error to this one at the boundary. Only this class is exported from the package root.
 */
export class SealedFormatError extends HttpError {
  /** @param message - error message */
  constructor(message: string = "Malformed sealed data") {
    super(message, 400);
  }
}
