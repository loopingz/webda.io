import { PipelineOptions, Writable } from "node:stream";
import { HttpContext } from "./httpcontext.js";
/**
 * Context is the object that will be passed to the services
 */
export declare abstract class Context {
    /**
     * Get the session linked to the context if exists
     */
    abstract getSession(): any;
    /**
     * Get the caches linked to the context
     */
    caches: any;
    /**
     * Allow extensions
     */
    protected extensions: {
        [key: string]: any;
    };
    /**
     * Store response headers
     */
    private responseHeaders;
    /**
     * Contain all registered promises to this context
     */
    _promises: Promise<any>[];
    /**
     * If the headers were flushed
     */
    protected flushed: boolean;
    isGlobalContext(): boolean;
    /**
     * Get current user id
     */
    abstract getCurrentUserId(): string | "system" | undefined;
    /**
     * Register a promise with the context
     * @param promise
     */
    registerPromise(promise: any): void;
    /**
     * Get an extension of the context
     * @param name of the extension
     * @returns extension object
     */
    getExtension<K = any>(name: string): K;
    /**
     *
     * @param name to add
     * @param extension object to store
     */
    setExtension(name: string, extension: any): this;
    /**
     * Ensure the whole execution is finished
     */
    end(): Promise<void>;
    /**
     * Return the user
     *
     * This method is not typed to avoid circular dependencies
     * @returns
     */
    abstract getCurrentUser(): Promise<any | undefined>;
    /**
     * Can be used to init the context if needed
     * Reading from the input or reaching to a db
     * @returns
     */
    init(): Promise<this>;
    /**
     * Set a header in the response
     */
    setHeader(name: string, value: string | number | string[]): void;
    /**
     * For easier compatibility with WebContext
     * On OperationContext this call is simply ignored
     */
    writeHead(_code: number, headers: {
        [key: string]: string | number | string[];
    }): void;
    /**
     * Get current response headers
     */
    getResponseHeaders(): any;
    /**
     * Send the headers to the client
     */
    flushHeaders(): Promise<void>;
    /**
     * Pipeline streams into the output stream
     *
     * @see https://nodejs.org/api/stream.html#streampipelinestreams-options
     */
    pipeline(stream1: NodeJS.ReadableStream, ...streams: Array<NodeJS.ReadWriteStream | PipelineOptions>): Promise<void>;
    abstract getOutputStream(): Promise<Writable>;
}
export declare abstract class IOperationContext<Input = any, Parameters = any, Output = any> extends Context {
    /**
     * Get the input of the context
     */
    abstract getInput(): Promise<Input>;
    /**
     * Get the raw input of the context
     */
    abstract getRawInput(limit?: number): Promise<any>;
    /**
     * Read one specific parameter
     * @param name
     * @returns
     * @deprecated Use getParameters
     */
    parameter(name: string, defaultValue?: any): any;
    abstract clearInput(): void;
    /**
     * Get the parameters of the context
     */
    abstract getParameters(): Parameters;
    /**
     * Write the output of the context
     * @param _data
     * @returns
     */
    abstract write(_data: Output): boolean;
    abstract setSession(session: any): void;
    /**
     * Create a new session
     *
     * Logout the current user
     */
    abstract newSession(): any;
}
/**
 * Data provided by the context
 */
export interface ContextProviderInfo {
    /**
     * Stream to write to
     */
    stream?: Writable;
    /**
     * If this is http context
     */
    http?: HttpContext;
    /**
     * true if this is a global context
     */
    global?: boolean;
    /**
     * Can contain any type of information
     */
    [key: string]: any;
}
/**
 * @category CoreFeatures
 */
export interface ContextProvider {
    /**
     * Info can contain any type of information
     * @param info
     */
    getContext(info: ContextProviderInfo): Context;
}
/**
 * Context aware interface
 *
 * An object that is aware of the context
 * It should allow to set the context only if `canUpdateContext` is true
 */
export interface IContextAware {
    context: Context;
}
/**
 * Set the context update
 * @param value
 */
export declare function setContextUpdate(value: boolean): void;
/**
 * Who can update the context
 * @returns
 */
export declare function canUpdateContext(): boolean;
/**
 * Represent a context from the web
 * It also fit the express response object
 */
export type IWebContext = IOperationContext & {
    setParameters: (params: object) => void;
    /**
     * Get the http context
     * @returns
     */
    getHttpContext: () => HttpContext;
    /**
     * Set a cookie in the browser
     * @param name
     * @param value
     * @param params
     * @returns
     */
    cookie: (name: string, value: string, params: any) => void;
    /**
     * Get the status code for the response
     */
    statusCode: number;
    /**
     * Redirect the user to another page
     */
    redirect: (url: string) => void;
    /**
     * Send the header response to the user
     */
    writeHead: (statusCode: number, headers: any) => void;
};
/**
 * Return the gather information from the repository
 * @param obj
 * @returns
 */
export declare function isWebContext(obj: any): obj is IWebContext;
//# sourceMappingURL=icontext.d.ts.map