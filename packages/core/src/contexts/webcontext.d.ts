import { OperationContext } from "./operationcontext.js";
import * as http from "http";
import { HttpContext } from "./httpcontext.js";
import { Readable, Writable } from "node:stream";
/**
 * @category CoreFeatures
 */
declare class Cookie {
    name: string;
    value: string;
    options: any;
}
/**
 * This represent in fact a WebContext
 * In 3.0 an abstract version of Context will replace this (closer to OperationContext)
 * @category CoreFeatures
 *
 */
export declare class WebContext<T = any, P = any, U = any> extends OperationContext<T, P, U> {
    /**
     * Contains the response headers
     */
    protected _outputHeaders: http.OutgoingHttpHeaders;
    /**
     * Current status code
     */
    statusCode: number;
    /**
     * Cookies to send back
     */
    _cookie: Map<string, Cookie>;
    /**
     *
     */
    headers: Map<string, string>;
    _route: any;
    _ended: Promise<any>;
    /**
     * If headers were flushed
     */
    protected headersFlushed: boolean;
    private _init;
    /**
     * Set current http context
     * @param httpContext current http context
     */
    setHttpContext(httpContext: HttpContext): void;
    /**
     * Get current http context
     */
    getHttpContext(): HttpContext;
    /**
     * @override
     */
    getRawInputAsString(limit?: number, timeout?: number, encoding?: string): Promise<string>;
    /**
     * @override
     */
    getRawInput(limit?: number, timeout?: number): Promise<Buffer<ArrayBufferLike>>;
    /**
     * @override
     */
    getRawStream(): Readable;
    /**
     * Remove everything that was about to be sent
     */
    resetResponse(): void;
    /**
     * Write data to the client
     *
     * @param output If it is an object it will be serializeb with toPublicJSON, if it is a String it will be appended to the result, if it is a buffer it will replace the result
     * @param ...args any arguments to pass to the toPublicJSON method
     */
    write(output: U, encoding?: string, cb?: (error: Error) => void): boolean;
    /**
     * Write the http return code and some headers
     * Those headers are not flushed yet so can still be overwritten
     *
     * @param {Number} statusCode to return to the client
     * @param {Object} headers to add to the response
     */
    writeHead(statusCode: number, headers?: http.OutgoingHttpHeaders): this;
    /**
     *
     * @returns
     */
    getResponseCode(): number;
    /**
     * Redirect to another url
     * @param url
     */
    redirect(url: string): void;
    /**
     * For compatibility reason
     */
    cookie(param: any, value: any, options?: any): void;
    getResponseCookies(): Map<string, Cookie>;
    isEnded(): Promise<any>;
    /******************************
     *
     * Express Compatibiliy method
     *
     ******************************/
    /**
     * Express response allow statusCode to be defined this way
     * @param code to return
     */
    status(code: number): this;
    /**
     * Express response allow answer to be sent this way
     * @param code to return
     */
    json(obj: any): this;
    /**
     * Return the response size
     * @returns
     */
    getResponseSize(): number | undefined;
    /**
     * Flush the request
     *
     * @emits 'finish' event
     * @throws Error if the request was already ended
     */
    end(): Promise<any>;
    /**
     * Alias to keep compatibility with WebContext
     * @param sanitizedOptions
     * @returns
     */
    getRequestBody(sanitizedOptions?: any): Promise<T>;
    /**
     * Get request body
     * @returns
     */
    getResponseBody(): string | false | Buffer<ArrayBufferLike>;
    /**
     * Retrieve a http.IncomingMessage valid from Context
     *
     * Need more testing
     * @returns
     */
    getRequest(): http.IncomingMessage;
    /**
     * Get the request locale if found
     */
    getLocale(): string;
    /**
     * Return true if Headers got flushed already
     * @returns
     */
    hasFlushedHeaders(): boolean;
    /**
     * Set flushed header status
     * @param status
     */
    setFlushedHeaders(status?: boolean): void;
    /**
     * @ignore
     * Used by Webda framework to set the body, session and output stream if known
     */
    constructor(httpContext: HttpContext, stream?: Writable, defaultHeaders?: http.OutgoingHttpHeaders);
    init(force?: boolean): Promise<this>;
}
export {};
//# sourceMappingURL=webcontext.d.ts.map