import {
  CORSFilter,
  CryptoService,
  Inject,
  InstanceCache,
  RequestFilter,
  Service,
  ServiceParameters,
  WebContext,
  WebdaError,
  useCoreEvents,
  useModel,
  useRegistry,
  useRepository
} from "@webda/core";
import type { ModelClass } from "@webda/core";
import { randomBytes } from "node:crypto";
import * as Hawk from "hawk";
import type { ApiKey } from "./apikey.model.js";

/**
 * Hawk Credentials representation
 */
export interface HawkCredentials {
  id: string;
  key: string;
  algorithm: string;
}
/**
 * Contains the hawk context
 */
export interface HawkContext {
  artifacts: any;
  credentials: any;
}
/**
 * Hawk service parameters
 */
export class HawkServiceParameters extends ServiceParameters {
  /**
   * Key model
   */
  keyModel?: string;
  /**
   * If specified will verify the signature match the key store in session
   */
  dynamicSessionKey?: string;
  /**
   * redirect endpoint
   */
  redirectUrl?: string;
  /**
   * Allowed redirection with CSRF
   */
  redirectUris?: string[];

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.redirectUris ??= [];
    return this;
  }
}

/**
 * Verify signature and sign server
 *
 * Implementation of hawk protocol
 * https://github.com/mozilla/hawk#readme
 *
 * @WebdaModda Hawk
 */
export default class HawkService<T extends HawkServiceParameters = HawkServiceParameters>
  extends Service<T>
  implements RequestFilter<WebContext>, CORSFilter<WebContext>
{
  static RegistryEntry = "HawkOrigins";
  /**
   * CryptoService
   */
  @Inject("CryptoService")
  protected cryptoService: CryptoService;
  /**
   * Model to use for apikey
   */
  model: ModelClass<ApiKey>;
  /**
   * Listeners to remove on stop
   */
  protected unsubscribers: (() => void)[] = [];

  /**
   * Retrieve the hawk credentials of an api key
   * @param id - the api key id
   * @param _timestamp - used to invalidate cache
   * @returns the hawk credentials
   */
  @InstanceCache()
  async getApiKey(id: string, _timestamp = undefined): Promise<HawkCredentials> {
    return (await this.model.ref(id).get()).toHawkCredentials();
  }

  /**
   * Return information for hawk
   * @param context - the request context
   * @returns the hawk request
   */
  async getHawkRequest(context: WebContext) {
    const http = context.getHttpContext();
    return {
      method: http.getMethod(),
      url: http.getUrl(),
      host: http.getHostName(),
      port: http.getPortNumber(),
      authorization: http.getUniqueHeader("authorization"),
      payload: (await http.getRawBody()) || "",
      contentType: http.getUniqueHeader("content-type") || ""
    };
  }

  /**
   * Add the Request listeners
   * @returns this
   */
  async init(): Promise<this> {
    await super.init();
    this.model = this.parameters.keyModel ? <any>useModel(this.parameters.keyModel) : undefined;
    if (this.parameters.keyModel && !this.model) {
      throw new Error(`Undefined model ${this.parameters.keyModel}`);
    }
    if (!this.model && !this.parameters.dynamicSessionKey) {
      throw new Error("Model must exists or dynamic session key must be defined");
    }
    if (this.model) {
      // Make sure origins exist
      await this.getOrigins();
      // Keep the origins registry in sync with the keys
      const repo = useRepository(this.model);
      const update = ({ object }) => object?.updateOrigins?.();
      repo.on("Created", update);
      repo.on("Updated", update);
      repo.on("Patched", update);
      this.unsubscribers.push(() => {
        repo.off("Created", update);
        repo.off("Updated", update);
        repo.off("Patched", update);
      });
    }

    // Solution to get an CSRF token
    if (this.parameters.redirectUrl) {
      this.addRoute(this.parameters.redirectUrl + "{?url}", ["GET"], this._redirect);
    }
    // Manage hawk server signature
    this.unsubscribers.push(useCoreEvents("Webda.Result", ({ context }) => this.signResponse(<WebContext>context)));
    return this;
  }

  /**
   * Remove listeners
   */
  async stop(): Promise<void> {
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
    await super.stop();
  }

  /**
   * Add the hawk server signature to the response
   * @param context - the request context
   */
  signResponse(context: WebContext) {
    try {
      // Flushed headers
      if (context.hasFlushedHeaders()) {
        return;
      }
      const headers = context.getResponseHeaders();
      const contentType = headers["Content-Type"] || headers["content-type"] || "application/json";
      // Send current time to be able to detect any time synchronization issue
      context.setHeader("x-server-time", Date.now());

      const hawkContext = context.getExtension<HawkContext>("hawk");
      if (hawkContext === undefined) {
        return;
      }
      const header = Hawk.server.header(hawkContext.credentials, hawkContext.artifacts, {
        payload: <string>context.getResponseBody(),
        contentType
      });
      // LambdaServer behave a bit different
      context.setHeader("Server-Authorization", header);
    } catch (err) {
      this.log("TRACE", `Hawk init failed : '${err.message}'`);
    }
  }

  /**
   * Redirect with a CSRF
   * @param context - the request context
   * @returns the redirect
   */
  async _redirect(context: WebContext) {
    return this.redirectWithCSRF(context, context.getParameters().url);
  }

  /**
   * Redirect to a website with CSRF
   * @param context - the request context
   * @param url - the url to redirect to
   */
  async redirectWithCSRF(context: WebContext, url: string) {
    if (!this.parameters.redirectUris.some(u => url.startsWith(u))) {
      throw new WebdaError.Forbidden("Invalid redirect");
    }
    context.getSession()[this.parameters.dynamicSessionKey] ??=
      `${this.cryptoService.current}.${randomBytes(16).toString("base64")}`;
    const updatedUrl = new URL(url);
    const [key, data] = context.getSession()[this.parameters.dynamicSessionKey].split(".");
    updatedUrl.searchParams.set("csrf", await this.cryptoService.hmac(data, key));
    context.redirect(updatedUrl.toString());
  }

  /**
   * Get the origins registry entry, creating it if needed
   * @returns the origins
   */
  @InstanceCache()
  async getOrigins(): Promise<any> {
    const registry = useRegistry();
    if (await registry.exists(HawkService.RegistryEntry)) {
      return registry.get(HawkService.RegistryEntry);
    }
    if (this.model) {
      return registry.put(HawkService.RegistryEntry, {});
    }
    return undefined;
  }

  /**
   * Check if an origin is allowed by any key
   * @param origin - the request origin
   * @returns true if allowed
   */
  @InstanceCache()
  async checkOPTIONS(origin: string) {
    const origins = await this.getOrigins();

    for (const key of Object.keys(origins || {}).filter(n => n.startsWith("key_"))) {
      // Origin is strictly matched by string search
      if (origins[key].statics.indexOf(origin) > -1) {
        return true;
      }
      // Origin can be matched by a special regexp too
      for (const pattern of origins[key].patterns) {
        if (origin.match(pattern)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Stricly parse the request's attributes and then approve or reject
   * @param context - the request context
   * @returns true if the request is allowed
   */
  async checkRequest(context: WebContext): Promise<boolean> {
    // Authorize the options
    if (context.getHttpContext().getMethod() === "OPTIONS") {
      return this.checkOPTIONS(context.getHttpContext().getUniqueHeader("origin") || "");
    }

    // Only check Hawk
    const authorization = context.getHttpContext().getUniqueHeader("authorization");
    if (!authorization || !authorization.startsWith("Hawk ")) {
      return false;
    }

    // We already check through the CORS part
    if (context.getExtension("HawkReviewed")) {
      return true;
    }
    context.setExtension("HawkReviewed", true);
    const hawkRequest = await this.getHawkRequest(context);
    // Specific dynamic session checks (useful for CSRF token)
    if (this.parameters.dynamicSessionKey && authorization.startsWith('Hawk id="session"')) {
      try {
        if (!context.getSession()[this.parameters.dynamicSessionKey]) {
          throw new WebdaError.Forbidden("No session key");
        }
        const [key, data] = context.getSession()[this.parameters.dynamicSessionKey].split(".");
        context.setExtension(
          "hawk",
          await Hawk.server.authenticate(hawkRequest, async () => ({
            id: "session",
            key: await this.cryptoService.hmac(data, key),
            algorithm: "sha256"
          }))
        );
      } catch (err) {
        if (err instanceof WebdaError.Forbidden) {
          throw err;
        }
        throw new WebdaError.Forbidden(`Hawk error (${err.message})`);
      }
    } else if (this.model) {
      // We have an Api Key store
      try {
        context.setExtension("hawk", await Hawk.server.authenticate(hawkRequest, this.getApiKey.bind(this)));
        const fullKey = await this.model.ref(context.getExtension<HawkContext>("hawk").credentials.id).get();
        if (!fullKey.canRequest(context)) {
          throw new WebdaError.Forbidden("Key not allowed to request");
        }
      } catch (err) {
        this.log("TRACE", err);
        if (err instanceof WebdaError.Forbidden) {
          throw err;
        }
        throw new WebdaError.Forbidden("Bad Hawk credentials");
      }
    }
    return true;
  }
}

export { HawkService };
