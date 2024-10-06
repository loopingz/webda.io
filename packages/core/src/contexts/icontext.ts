// This file should not be exported in the library as it should only be used by CoreModel
import { Writable } from "node:stream";

import { HttpContext } from "./httpcontext";
import { NotEnumerable } from "@webda/tsc-esm";

/**
 * Context is the object that will be passed to the services
 */
export abstract class Context {
  /**
   * Allow extensions
   */
  protected extensions: { [key: string]: any };
  /**
   * Contain all registered promises to this context
   */
  @NotEnumerable
  _promises: Promise<any>[];

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
  }
  /**
   * Return the user
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
  parameter(name: string): any {
    return this.getParameters()[name];
  }
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
 */
export type IWebContext = {
  setRoute(arg0: any): unknown;
  setParameters: (params: object) => void;
  getHttpContext: () => HttpContext;
  cookie: (name: string, value: string, params: any) => void;
};

/**
 * Return the gather information from the repository
 * @param obj
 * @returns
 */
export function isWebContext(obj: any): obj is IWebContext {
  return obj.getHttpContext !== undefined && obj.cookie !== undefined;
}
