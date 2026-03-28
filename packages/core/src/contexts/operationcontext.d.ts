import { IOperationContext } from "./icontext.js";
import { Readable, Writable } from "stream";
import { Session } from "../session/session.js";
import sanitize from "sanitize-html";
import { IUser } from "../models/types.js";
/**
 * OperationInput
 */
export type OperationInput<T = any, U = any> = {
    input: T;
    parameters: U;
};
/**
 * OperationContext is used when call to an operation
 *
 * @param T type of input for this context
 * @param U type of output for this context
 * @param P type of parameters for this context
 */
export declare class OperationContext<Input = any, Parameters = any, Output = any> extends IOperationContext<Input, Parameters, Output> {
    /**
     * Session
     */
    protected session: Session;
    /**
     * Contain the sanitized request body if computed
     */
    protected _sanitized: any;
    /**
     * Output
     */
    protected _body: string;
    /**
     * Loaded user if exist
     */
    private user;
    parameters: Parameters;
    /**
     * @ignore
     * Used by Webda framework to set the body, session and output stream if known
     */
    constructor(stream?: Writable);
    /**
     * Set the session
     * @param session
     */
    setSession(session: Session): void;
    /**
     * Output stream
     */
    _stream: Writable;
    /**
     * Get an extension of the context
     * @param name of the extension
     * @returns extension object
     */
    getExtension<K = any>(name: string): K;
    /**
     * Get one parameter
     * @param name
     * @returns
     */
    parameter(name: string, defaultValue?: any): any;
    /**
     * Get the parameters
     * @returns
     */
    getParameters(): Parameters;
    /**
     * Set the parameters
     */
    setParameters(params: Parameters): void;
    /**
     *
     * @param name to add
     * @param extension object to store
     */
    setExtension(name: string, extension: any): this;
    /**
     * Register a promise with the context
     * @param promise
     */
    addAsyncRequest(promise: any): void;
    /**
     * Get output as string, if a OutputStream is provided it will returned null
     * @returns
     */
    getOutput(): string;
    /**
     * Ensure the whole execution is finished
     */
    end(): Promise<void>;
    /**
     * Remove the input
     */
    clearInput(): void;
    getInput(sanitizedOptions?: sanitize.IOptions & {
        defaultValue?: any;
        raw?: boolean | string[];
    }): Promise<Input>;
    /**
     * By default empty
     * @returns
     */
    getRawInputAsString(limit?: number, timeout?: number, encoding?: BufferEncoding): Promise<string>;
    /**
     * @override
     */
    getRawInput(_limit?: number, _timeout?: number): Promise<Buffer>;
    /**
     * @override
     */
    getRawStream(): Readable;
    /**
     * Get the HTTP stream to output raw data
     * @returns {*}
     */
    getOutputStream(): Promise<Writable>;
    /**
     * Get linked session
     * @returns
     */
    getSession<K = Session>(): K;
    newSession(): Session;
    /**
     * Remove sanitized body
     */
    reinit(): void;
    /**
     * Create a buffer stream
     */
    createStream(): void;
    /**
     * Remove everything that was about to be sent
     */
    resetResponse(): void;
    /**
     * Write data to the client
     *
     * @param output If it is an object it will be serialized with toPublicJSON, if it is a String it will be appended to the result, if it is a buffer it will replace the result
     * @param ...args any arguments to pass to the toPublicJSON method
     */
    write(output: Output, _encoding?: string, _cb?: (error: Error) => void): boolean;
    init(): Promise<this>;
    /**
     * Get the current user from session
     */
    getCurrentUser<K extends IUser>(refresh?: boolean): Promise<K>;
    /**
     * Get the current user id from session
     */
    getCurrentUserId(): string;
}
//# sourceMappingURL=operationcontext.d.ts.map