/**
 * Error with a code
 */
export class CodeError extends Error {
  code: string;

  /**
   *
   * @param code
   * @param message
   */
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }

  /**
   * Return error code
   */
  getCode() {
    return this.code;
  }

  /**
   * Http response code
   * @returns
   */
  getResponseCode() {
    return 500;
  }
}

export class HttpError extends CodeError {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super("", message);
    this.code = this.constructor.name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
  }

  getResponseCode(): number {
    return this.statusCode;
  }
}

export class Unauthorized extends HttpError {
  constructor(message: string) {
    super(message, 401);
  }
}

export class Forbidden extends HttpError {
  constructor(message: string) {
    super(message, 403);
  }
}

export class NotFound extends HttpError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class BadRequest extends HttpError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class Conflict extends HttpError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class NotImplemented extends HttpError {
  constructor(message: string) {
    super(message, 501);
  }
}

export class ServiceUnavailable extends HttpError {
  constructor(message: string) {
    super(message, 503);
  }
}

export class TooManyRequests extends HttpError {
  constructor(message: string) {
    super(message, 429);
  }
}

export class Gone extends HttpError {
  constructor(message: string) {
    super(message, 410);
  }
}

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
