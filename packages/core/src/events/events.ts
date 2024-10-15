import { AbstractService, Configuration } from "../internal/iapplication";
import { Context, ContextProviderInfo } from "../contexts/icontext";
import { IWebContext } from "../contexts/icontext";
import { OperationContext } from "../contexts/operationcontext";

export type CoreEvents = {
  /**
   * Emitted when new result is sent
   */
  "Webda.Result": { context: IWebContext };
  /**
   * Emitted when new request comes in
   */
  "Webda.Request": { context: IWebContext };
  /**
   * Emitted when a request does not match any route
   */
  "Webda.404": { context: IWebContext };
  /**
   * Emitted when Services have been initialized
   */
  "Webda.Init.Services": { [key: string]: AbstractService };
  /**
   * Emitted when Services have been created
   */
  "Webda.Create.Services": { [key: string]: AbstractService };
  /**
   * Emitted when Core is initialized
   */
  "Webda.Init": Configuration;
  /**
   * Emitted whenever a new Context is created
   */
  "Webda.NewContext": {
    context: Context;
    info: ContextProviderInfo;
  };
  /**
   * Sent when route is added to context
   */
  "Webda.UpdateContextRoute": {
    context: IWebContext;
  };
  "Webda.OperationSuccess": {
    context: OperationContext;
    operationId: string;
  };
  "Webda.OperationFailure": {
    context: OperationContext;
    operationId: string;
    error: Error;
  };
  "Webda.BeforeOperation": {
    context: OperationContext;
    operationId: string;
  };
  [key: string]: unknown;
};

export class EventWithContext<T extends Context = Context> {
  context: T;
}

/**
 * Emit a core event
 * @param event
 * @param data
 */
export function emitCoreEvent<K extends keyof CoreEvents>(event: K, data: CoreEvents[K]) {}

/**
 * Add a listener to a core event
 * @param event
 * @param listener
 */
export function useCoreEvents<K extends keyof CoreEvents>(
  event: K,
  listener: (evt: CoreEvents[K]) => Promise<void> | void
) {}
