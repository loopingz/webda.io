/**
 * Error with a code
 */
export class CodeError extends Error {
  code: string;

  /**
   *
   * @param code - the status code
   * @param message - the message
   */
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }

  /**
   * Return error code
   * @returns the result
   */
  getCode() {
    return this.code;
  }

  /**
   * Http response code
   * @returns the result
   */
  getResponseCode() {
    return 500;
  }
}

/** HTTP error with a status code, auto-generating the error code from the class name */
export class HttpError extends CodeError {
  /**
   * Optional structured details for the client. Validation errors put the
   * AJV `errors[]` here so consumers can map field-level failures to the UI
   * without parsing the human-readable message.
   */
  details?: any;

  /** Create a new HttpError
   * @param message - error message
   * @param statusCode - HTTP status code
   * @param details - optional structured details (e.g. validation errors)
   */
  constructor(
    message: string,
    public statusCode: number = 500,
    details?: any
  ) {
    super("", message);
    this.code = this.constructor.name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
    if (details !== undefined) {
      this.details = details;
    }
  }

  /**
   * Get the HTTP status code for this error
   * @returns the result number
   */
  getResponseCode(): number {
    return this.statusCode;
  }
}

/** HTTP 401 Unauthorized error */
export class Unauthorized extends HttpError {
  /** Create a new Unauthorized
   * @param message - error message
   */
  constructor(message: string) {
    super(message, 401);
  }
}

/** HTTP 403 Forbidden error */
export class Forbidden extends HttpError {
  /** Create a new Forbidden
   * @param message - error message
   */
  constructor(message: string) {
    super(message, 403);
  }
}

/** HTTP 404 Not Found error */
export class NotFound extends HttpError {
  /** Create a new NotFound
   * @param message - error message
   */
  constructor(message: string) {
    super(message, 404);
  }
}

/** HTTP 400 Bad Request error */
export class BadRequest extends HttpError {
  /** Create a new BadRequest
   * @param message - error message
   * @param details - optional structured details (e.g. AJV validation errors)
   */
  constructor(message: string, details?: any) {
    super(message, 400, details);
  }
}

/** HTTP 409 Conflict error */
export class Conflict extends HttpError {
  /** Create a new Conflict
   * @param message - error message
   */
  constructor(message: string) {
    super(message, 409);
  }
}

/** HTTP 501 Not Implemented error */
export class NotImplemented extends HttpError {
  /** Create a new NotImplemented
   * @param message - error message
   */
  constructor(message: string) {
    super(message, 501);
  }
}

/** HTTP 503 Service Unavailable error */
export class ServiceUnavailable extends HttpError {
  /** Create a new ServiceUnavailable
   * @param message - error message
   */
  constructor(message: string) {
    super(message, 503);
  }
}

/** HTTP 429 Too Many Requests error */
export class TooManyRequests extends HttpError {
  /** Create a new TooManyRequests
   * @param message - error message
   */
  constructor(message: string) {
    super(message, 429);
  }
}

/** HTTP 410 Gone error */
export class Gone extends HttpError {
  /** Create a new Gone
   * @param message - error message
   */
  constructor(message: string) {
    super(message, 410);
  }
}

/** HTTP 412 Precondition Failed error */
export class PreconditionFailed extends HttpError {
  /** Create a new PreconditionFailed
   * @param message - error message
   */
  constructor(message: string) {
    super(message, 412);
  }
}

/**
 * Can be used to redirect the user
 */
export class Redirect extends HttpError {
  /** Create a new Redirect
   * @param message - error message
   * @param location - URL to redirect to
   */
  constructor(
    message: string,
    public location: string
  ) {
    super(message, 302);
  }
}
