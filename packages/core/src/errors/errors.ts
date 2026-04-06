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
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super("", message);
    this.code = this.constructor.name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
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
  constructor(message: string) {
    super(message, 401);
  }
}

/** HTTP 403 Forbidden error */
export class Forbidden extends HttpError {
  constructor(message: string) {
    super(message, 403);
  }
}

/** HTTP 404 Not Found error */
export class NotFound extends HttpError {
  constructor(message: string) {
    super(message, 404);
  }
}

/** HTTP 400 Bad Request error */
export class BadRequest extends HttpError {
  constructor(message: string) {
    super(message, 400);
  }
}

/** HTTP 409 Conflict error */
export class Conflict extends HttpError {
  constructor(message: string) {
    super(message, 409);
  }
}

/** HTTP 501 Not Implemented error */
export class NotImplemented extends HttpError {
  constructor(message: string) {
    super(message, 501);
  }
}

/** HTTP 503 Service Unavailable error */
export class ServiceUnavailable extends HttpError {
  constructor(message: string) {
    super(message, 503);
  }
}

/** HTTP 429 Too Many Requests error */
export class TooManyRequests extends HttpError {
  constructor(message: string) {
    super(message, 429);
  }
}

/** HTTP 410 Gone error */
export class Gone extends HttpError {
  constructor(message: string) {
    super(message, 410);
  }
}

/** HTTP 412 Precondition Failed error */
export class PreconditionFailed extends HttpError {
  constructor(message: string) {
    super(message, 412);
  }
}

/**
 * Can be used to redirect the user
 */
export class Redirect extends HttpError {
  constructor(
    message: string,
    public location: string
  ) {
    super(message, 302);
  }
}
