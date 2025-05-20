import {
  Cache,
  CoreModelDefinition,
  CryptoService,
  Inject,
  RequestFilter,
  Service,
  ServiceParameters,
  WebContext,
  WebdaError
} from "@webda/core";
import * as Hawk from "hawk";
import { ApiKey } from "./apikey";

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
 *
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
   * @param params
   */
  redirectUrl?: string;
  /**
   * Allowed redirection with CSRF
   */
  redirectUris?: string[];

  /**
   * @inheritdoc
   */
  constructor(params: any) {
    super(params);
    this.redirectUris ??= [];
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
export default class HawkService extends Service<HawkServiceParameters> implements RequestFilter {
  static RegistryEntry = "HawkOrigins";
  /**
   * CryptoService
   */
  @Inject("CryptoService")
  protected cryptoService: CryptoService;
  /**
   * Model to use for apikey
   */
  model: CoreModelDefinition<ApiKey>;
  /**
   * @inheritdoc
   */
  loadParameters(params: any) {
    return new HawkServiceParameters(params);
  }

  /**
   *
   * @param id
   * @param _timestamp used to invalidate cache
   * @returns
   */
  @Cache()
  async getApiKey(id, _timestamp = undefined) {
    return (await this.model.ref(id).get()).toHawkCredentials();
  }

  /**
   * Return information for hawk
   */
  async getHawkRequest(context: WebContext) {
    let http = context.getHttpContext();
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
   */
  async init(): Promise<this> {
    await super.init();
    this.model = this.parameters.keyModel ? this.getWebda().getModel(this.parameters.keyModel) : undefined;
    if (!this.model && !this.parameters.dynamicSessionKey) {
      throw new Error("Model must exists or dynamic session key must be defined");
    }
    if (this.model) {
      // Make sure origins exist
      await this.getOrigins();
    }

    this.getWebda().registerCORSFilter(this);
    this.getWebda().registerRequestFilter(this);

    // Solution to get an CSRF token
    if (this.parameters.redirectUrl) {
      this.addRoute(this.parameters.redirectUrl + "{?url}", ["GET"], this._redirect);
    }
    // Manage hawk server signature
    this.getWebda().on("Webda.Result", async ({ context }) => {
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
          payload: context.getResponseBody(),
          contentType
        });
        // LambdaServer behave a bit different
        context.setHeader("Server-Authorization", header);
      } catch (err) {
        this.log("TRACE", `Hawk init failed : '${err.message}'`);
      }
    });
    return this;
  }

  /**
   * Redirect with a CSRF
   * @param context
   */
  async _redirect(context: WebContext) {
    return this.redirectWithCSRF(context, context.getParameters().url);
  }

  /**
   * Redirect to a website with CSRF
   */
  async redirectWithCSRF(context: WebContext, url: string) {
    if (!this.parameters.redirectUris.some(u => url.startsWith(u))) {
      throw new WebdaError.Forbidden("Invalid redirect");
    }
    context.getSession()[this.parameters.dynamicSessionKey] ??= `${
      this.cryptoService.current
    }.${this.getWebda().getUuid("base64")}`;
    let updatedUrl = new URL(url);
    const [key, data] = context.getSession()[this.parameters.dynamicSessionKey].split(".");
    updatedUrl.searchParams.set("csrf", await this.cryptoService.hmac(data, key));
    context.redirect(updatedUrl.toString());
  }

  @Cache()
  async getOrigins(): Promise<any> {
    const registry = this.getWebda().getRegistry();
    let origin = await registry.get(HawkService.RegistryEntry);
    if (origin === undefined && this.model) {
      origin = await registry.save({ uuid: HawkService.RegistryEntry });
    }
    return origin;
  }

  @Cache()
  async checkOPTIONS(origin: string) {
    let origins = await this.getOrigins();

    for (let key of Object.keys(origins).filter(n => n.startsWith("key_"))) {
      // Origin is strictly matched by string search
      if (origins[key].statics.indexOf(origin) > -1) {
        return true;
      }
      // Origin can be matched by a special regexp too
      for (let pattern of origins[key].patterns) {
        if (origin.match(pattern)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Stricly parse the request's attributes and then approve or reject
   * @param {Context} context
   * @returns {Promise<boolean>}
   */
  async checkRequest(context: WebContext): Promise<boolean> {
    // Authorize the options
    if (context.getHttpContext().getMethod() === "OPTIONS") {
      return this.checkOPTIONS(context.getHttpContext().getUniqueHeader("origin") || "");
    }

    // Only check Hawk
    let authorization = context.getHttpContext().getUniqueHeader("authorization");
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
        let fullKey = await this.model.ref(context.getExtension("hawk").credentials.id).get();
        if (!(await fullKey.canRequest(context))) {
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
