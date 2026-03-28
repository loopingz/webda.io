/**
 * Error with a code
 */
export declare class CodeError extends Error {
    code: string;
    /**
     *
     * @param code
     * @param message
     */
    constructor(code: string, message: string);
    /**
     * Return error code
     */
    getCode(): string;
    /**
     * Http response code
     * @returns
     */
    getResponseCode(): number;
}
export declare class HttpError extends CodeError {
    statusCode: number;
    constructor(message: string, statusCode?: number);
    getResponseCode(): number;
}
export declare class Unauthorized extends HttpError {
    constructor(message: string);
}
export declare class Forbidden extends HttpError {
    constructor(message: string);
}
export declare class NotFound extends HttpError {
    constructor(message: string);
}
export declare class BadRequest extends HttpError {
    constructor(message: string);
}
export declare class Conflict extends HttpError {
    constructor(message: string);
}
export declare class NotImplemented extends HttpError {
    constructor(message: string);
}
export declare class ServiceUnavailable extends HttpError {
    constructor(message: string);
}
export declare class TooManyRequests extends HttpError {
    constructor(message: string);
}
export declare class Gone extends HttpError {
    constructor(message: string);
}
export declare class PreconditionFailed extends HttpError {
    constructor(message: string);
}
/**
 * Can be used to redirect the user
 */
export declare class Redirect extends HttpError {
    location: string;
    constructor(message: string, location: string);
}
//# sourceMappingURL=errors.d.ts.map