import { Service } from "./service.js";
import { WebContext } from "../contexts/webcontext.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { Context, ContextProvider, ContextProviderInfo } from "../contexts/icontext.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { emitCoreEvent } from "../events/events.js";

class HttpServerParameters extends ServiceParameters {
  /**
   * Will not try to parse request bigger than this
   *
   * This parameter can be overriden by a direct call to
   * getHttpContext().getRawBody(xxx)
   *
   * @default 10Mb
   */
  requestLimit?: number;
  /**
   * Will not take more than this to read a request (unit: milliseconds)
   *
   * This parameter can be overriden by a direct call to
   * getHttpContext().getRawBody(undefined, xxx)
   *
   * @default 60000
   */
  requestTimeout?: number;

  /**
   * Trust this reverse proxies
   */
  trustedProxies?: string | string[];
  /**
   * Allowed origin for referer that match
   * any of this regexp
   *
   * {@link OriginFilter}
   */
  csrfOrigins?: string[];
  /**
   * Default headers to send to the client
   *
   * Having a Cache-Control: private will prevent caching for API
   * If you overwrite this parameter, you will need to add it back
   */
  defaultHeaders?: { [key: string]: string };
  /**
   * Port to listen on
   *
   * @default 18080
   */
  port?: number;
}

export type HttpServerEvents = {
  /**
   * Emitted when new result is sent
   */
  "Webda.Result": { context: WebContext };
  /**
   * Emitted when new request comes in
   */
  "Webda.Request": { context: WebContext };
  /**
   * Emitted when a request does not match any route
   */
  "Webda.404": { context: WebContext };
  /**
   * Sent when route is added to context
   */
  "Webda.UpdateContextRoute": {
    context: WebContext;
  };
};

/**
 * Basic HTTP server service
 */
export class HttpServer<
  P extends HttpServerParameters = HttpServerParameters,
  E extends HttpServerEvents = HttpServerEvents
> extends Service<P, E> {
  /**
   * Registered context providers
   */
  private contextProviders: ContextProvider[] = [
    {
      getContext: (info: ContextProviderInfo) => {
        // If http is defined, return a WebContext
        if (info.http) {
          return new WebContext(info.http, info.stream);
        }
        return new OperationContext(info.stream);
      }
    }
  ];

  /**
   * Get a context based on the info
   * @param info
   * @returns
   * @TODO Move to the HttpServer service
   */
  async newContext<T extends Context>(info: ContextProviderInfo, noInit: boolean = false): Promise<Context> {
    let context: Context;
    this.contextProviders.find(provider => (context = <Context>provider.getContext(info)) !== undefined);
    if (!noInit) {
      await context.init();
    }
    await emitCoreEvent("Webda.NewContext", { context, info });
    return <T>context;
  }

  /**
   * Register a new context provider
   * @param provider
   * @TODO Move to the HttpServer service
   */
  registerContextProvider(provider: ContextProvider) {
    this.contextProviders ??= [];
    this.contextProviders.unshift(provider);
  }
}
