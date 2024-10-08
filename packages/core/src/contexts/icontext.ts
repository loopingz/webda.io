// This file should not be exported in the library as it should only be used by CoreModel
import { PipelineOptions, Writable } from "node:stream";

import { HttpContext } from "./httpcontext";
import { NotEnumerable } from "@webda/tsc-esm";
import { pipeline } from "node:stream/promises";

/**
 * Context is the object that will be passed to the services
 */
export abstract class Context {
  /**
   * Allow extensions
   */
  protected extensions: { [key: string]: any };

  /**
   * Store response headers
   */
  private responseHeaders = {};
  /**
   * Contain all registered promises to this context
   */
  @NotEnumerable
  _promises: Promise<any>[];
  /**
   * If the headers were flushed
   */
  protected flushed: boolean = false;

  isGlobalContext(): boolean {
    return false;
  }

  /**
   * Get current user id
   */
  abstract getCurrentUserId(): string | "system";

  /**
   * Register a promise with the context
   * @param promise
   */
  registerPromise(promise) {
    this._promises.push(promise);
  }
  /**
   * Get an extension of the context
   * @param name of the extension
   * @returns extension object
   */
  public getExtension<K = any>(name: string): K {
    return <K>this.extensions[name];
  }
  /**
   *
   * @param name to add
   * @param extension object to store
   */
  public setExtension(name: string, extension: any): this {
    this.extensions[name] = extension;
    return this;
  }
  /**
   * Ensure the whole execution is finished
   */
  async end() {
    await Promise.all(this._promises);
    await this.flushHeaders();
  }
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
  async init(): Promise<this> {
    return this;
  }
  /**
   * Set a header in the response
   */
  setHeader(name: string, value: string | number | string[]) {
    if (this.flushed) {
      throw new Error("Headers have been sent already");
    }
    this.responseHeaders[name] = value;
  }

  /**
   * For easier compatibility with WebContext
   * On OperationContext this call is simply ignored
   */
  writeHead(_code: number, headers: { [key: string]: string | number | string[] }) {
    // Do nothing
    Object.entries(headers).forEach(([key, value]) => {
      this.setHeader(key, value);
    });
  }

  /**
   * Get current response headers
   */
  getResponseHeaders(): any {
    return this.responseHeaders;
  }

  /**
   * Send the headers to the client
   */
  async flushHeaders() {
    if (this.flushed) {
      return;
    }
    this.responseHeaders = {};
    this.flushed = true;
  }

  /**
   * Pipeline streams into the output stream
   *
   * @see https://nodejs.org/api/stream.html#streampipelinestreams-options
   */
  async pipeline(
    stream1: NodeJS.ReadableStream,
    ...streams: Array<NodeJS.ReadWriteStream | PipelineOptions>
  ): Promise<void> {
    const isPipelineOptions = (arg: NodeJS.ReadWriteStream | PipelineOptions): arg is PipelineOptions =>
      (arg as NodeJS.ReadWriteStream).writable === undefined;
    const item = streams.pop();
    if (isPipelineOptions(item)) {
      return pipeline([stream1, ...(<Array<NodeJS.ReadWriteStream>>streams), await this.getOutputStream()], item);
    } else {
      return pipeline([stream1, ...(<Array<NodeJS.ReadWriteStream>>streams), await this.getOutputStream()]);
    }
  }

  abstract getOutputStream(): Promise<Writable>;
}

export abstract class IOperationContext<Input = any, Parameters = any, Output = any> extends Context {
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
  parameter(name: string, defaultValue?: any): any {
    return this.getParameters()[name] ?? defaultValue;
  }

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

  abstract getSession(): any;
  /**
   * Create a new session
   *
   * Logout the current user
   */
  abstract newSession(): void;
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
 */
let contextUpdate = false;

/**
 * Set the context update
 * @param value
 */
export function setContextUpdate(value: boolean) {
  contextUpdate = value;
}

/**
 * Who can update the context
 * @returns
 */
export function canUpdateContext(): boolean {
  return contextUpdate;
}

/**
 * Represent a context from the web
 * It also fit the express response object
 */
export type IWebContext = IOperationContext & {
  setRoute(arg0: any): unknown;
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
export function isWebContext(obj: any): obj is IWebContext {
  return obj.getHttpContext !== undefined && obj.cookie !== undefined;
}
