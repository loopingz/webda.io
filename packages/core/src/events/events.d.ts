import { AbstractService } from "../services/iservice.js";
import { Context, ContextProviderInfo } from "../contexts/icontext.js";
import { IWebContext } from "../contexts/icontext.js";
import { OperationContext } from "../contexts/operationcontext.js";
export type CoreEvents = {
    /**
     * Emitted when new result is sent
     */
    "Webda.Result": {
        context: IWebContext;
    };
    /**
     * Emitted when new request comes in
     */
    "Webda.Request": {
        context: IWebContext;
    };
    /**
     * Emitted when a request does not match any route
     */
    "Webda.404": {
        context: IWebContext;
    };
    /**
     * Emitted when Services have been initialized
     */
    "Webda.Init.Services": {
        [key: string]: AbstractService;
    };
    /**
     * Emitted when Services have been created
     */
    "Webda.Create.Services": {
        [key: string]: AbstractService;
    };
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
    "Webda.Configuration.Applying": {
        configuration: {
            [key: string]: any;
        };
        delta: {
            [key: string]: any;
        };
    };
    "Webda.Configuration.Applied": {
        configuration: {
            [key: string]: any;
        };
        delta: {
            [key: string]: any;
        };
    };
};
export declare class EventWithContext<T extends Context = Context> {
    context: T;
}
/**
 * Emit a core event
 * @param event
 * @param data
 */
export declare function emitCoreEvent<K extends keyof CoreEvents>(event: K, data: CoreEvents[K]): void;
/**
 * Add a listener to a core event
 * @param event
 * @param listener
 */
export declare function useCoreEvents<K extends keyof CoreEvents>(event: K, listener: (evt: CoreEvents[K]) => Promise<void> | void, once?: boolean): () => void;
//# sourceMappingURL=events.d.ts.map