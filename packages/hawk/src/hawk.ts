import { Cache, Context, CryptoService, Inject, RequestFilter, Service, ServiceParameters, Store } from "@webda/core";
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
   * Key store name
   *
   * @default 'apikeys'
   */
  keysStore?: string;
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
    this.keysStore ??= "apikeys";
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
  /**
   *
   */
  protected store: Store<ApiKey> = undefined;

  /**
   * CryptoService
   */
  @Inject("CryptoService")
  protected cryptoService: CryptoService;
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
    return (await this.store.get(id)).toHawkCredentials();
  }

  /**
   * Return information for hawk
   */
  async getHawkRequest(context: Context) {
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
    this.store = this.getService<Store<ApiKey>>(this.parameters.keysStore);
    if (!this.store && !this.parameters.dynamicSessionKey) {
      throw new Error("Store must exist");
    }
    if (this.store) {
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
  async _redirect(context: Context) {
    const { url } = context.getParameters();
    if (!this.parameters.redirectUris.includes(url)) {
      throw 403;
    }
    context.getSession()[this.parameters.dynamicSessionKey] ??= this.getWebda().getUuid("base64");
    let updatedUrl = new URL(url);
    updatedUrl.searchParams.set(
      "csrf",
      await this.cryptoService.hmac(context.getSession()[this.parameters.dynamicSessionKey])
    );
    context.redirect(updatedUrl.toString());
  }

  @Cache()
  async getOrigins(): Promise<any> {
    let origin = await this.store.get("origins");
    if (origin === undefined) {
      origin = await this.store.save({ uuid: "origins" });
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
  async checkRequest(context: Context): Promise<boolean> {
    // Authorize the options
    if (context.getHttpContext().getMethod() === "OPTIONS") {
      return this.checkOPTIONS(context.getHttpContext().getUniqueHeader("origin") || "");
    }

    // Only check Hawk
    let authorization = context.getHttpContext().getUniqueHeader("authorization");
    if (!authorization || !authorization.startsWith("Hawk id=")) {
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
        context.setExtension(
          "hawk",
          await Hawk.server.authenticate(hawkRequest, async () => ({
            id: "session",
            key: await this.cryptoService.hmac(context.getSession()[this.parameters.dynamicSessionKey]),
            algorithm: "sha256"
          }))
        );
      } catch (err) {
        this.log("ERROR", `Hawk error (${err.message})`);
        throw 403;
      }
    } else if (this.store) {
      // We have an Api Key store
      try {
        context.setExtension("hawk", await Hawk.server.authenticate(hawkRequest, this.getApiKey.bind(this)));
        let fullKey = await this.store.get(context.getExtension("hawk").credentials.id);
        if (!fullKey.canRequest(context.getHttpContext())) {
          throw 403;
        }
      } catch (err) {
        this.log("TRACE", err);
        throw 403;
      }
    }
    return true;
  }
}

export { HawkService };
