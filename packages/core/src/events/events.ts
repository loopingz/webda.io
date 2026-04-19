import { AbstractService } from "../services/iservice.js";
import { Configuration } from "../application/iconfiguration.js";
import { Context, ContextProviderInfo } from "../contexts/icontext.js";
import { IWebContext } from "../contexts/icontext.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { EventEmitter } from "node:events";
import { useLog } from "@webda/workout";

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
  "Webda.Init": Record<string, any>;
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
  "Webda.Configuration.Applying": { configuration: { [key: string]: any }; delta: { [key: string]: any } };
  "Webda.Configuration.Applied": { configuration: { [key: string]: any }; delta: { [key: string]: any } };
};

/** Base event class that carries a request context */
export class EventWithContext<T extends Context = Context> {
  context: T;
}

const emitter = new EventEmitter();
/**
 * Emit a core event.
 *
 * Async listeners can return a rejected promise that would otherwise escape as
 * an unhandled rejection and crash the process. We iterate listeners manually
 * so we can attach a `.catch()` on async returns and isolate sync throws —
 * listeners must never take down the emitter's caller.
 *
 * @param event - the event name
 * @param data - the data to process
 */
export function emitCoreEvent<K extends keyof CoreEvents>(event: K, data: CoreEvents[K]) {
  for (const listener of emitter.listeners(event)) {
    try {
      const result = (listener as (d: CoreEvents[K]) => unknown)(data);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        (result as Promise<unknown>).catch(err => {
          useLog("ERROR", `Async listener error on "${String(event)}":`, err);
        });
      }
    } catch (err) {
      useLog("ERROR", `Listener error on "${String(event)}":`, err);
    }
  }
}

/**
 * Add a listener to a core event
 * @param event - the event name
 * @param listener - the event listener
 * @param once - whether to listen once
 * @returns true if the condition is met
 */
export function useCoreEvents<K extends keyof CoreEvents>(
  event: K,
  listener: (evt: CoreEvents[K]) => Promise<void> | void,
  once: boolean = false
): () => void {
  emitter[once ? "once" : "on"](event, listener);
  return () => emitter.off(event, listener);
}
