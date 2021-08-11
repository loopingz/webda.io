import { Service, ServiceParameters, Store, Cache, RequestFilter, Context, EventWebdaResult } from "@webda/core";
import { ApiKey } from "./apikey";
import * as Hawk from "hawk";

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
   * @inheritdoc
   */
  constructor(params: any) {
    super(params);
    this.keysStore ??= "apikeys";
  }
}

/**
 * Verify signature and sign server
 *
 * Implementation of hawk protocol
 * https://github.com/mozilla/hawk#readme
 */
export default class HawkService extends Service<HawkServiceParameters> implements RequestFilter {
  /**
   *
   */
  protected store: Store<ApiKey> = undefined;

  /**
   * @inheritdoc
   */
  loadParameters(params: any) {
    return new HawkServiceParameters(params);
  }

  @Cache()
  async getApiKey(id, timestamp = undefined) {
    return (await this.store.get(id)).toHawkCredentials();
  }

  /**
   * Return information for hawk
   */
  getHawkRequest(context: Context) {
    let http = context.getHttpContext();
    return {
      method: http.getMethod(),
      url: http.getUrl(),
      host: (http.getHeaders()["host"] || "").split(":")[0],
      port: http.getPort(),
      authorization: http.getHeaders()["authorization"]
    };
  }

  /**
   * Add the Request listeners
   */
  async init() {
    await super.init();
    this.store = this.getService<Store<ApiKey>>(this.parameters.keysStore);
    if (!this.store) {
      throw new Error("Store must exist");
    }
    // Make sure origins exist
    await this.getOrigins();
    this.getWebda().registerRequestFilter(this);
    // Manage hawk server signature
    this.getWebda().addListener("Webda.Result", async ({ context }: EventWebdaResult) => {
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
      return this.checkOPTIONS(context.getHttpContext().getHeader("origin") || "");
    }

    // Only check Hawk
    let authorization = context.getHttpContext().getHeaders()["authorization"];
    if (!authorization || !authorization.startsWith("Hawk id=")) {
      return false;
    }

    // Specific dynamic session checks (useful for CSRF token)
    if (this.parameters.dynamicSessionKey && authorization.startsWith('Hawk id="session"')) {
      try {
        context.setExtension(
          "hawk",
          await Hawk.server.authenticate(this.getHawkRequest(context), () => ({
            id: "session",
            key: context.getSession()[this.parameters.dynamicSessionKey],
            algorithm: "sha256"
          }))
        );
      } catch (err) {
        this.log("ERROR", `Hawk error (${err.message || err})`);
        return false;
      }
      return true;
    }

    try {
      context.setExtension(
        "hawk",
        await Hawk.server.authenticate(this.getHawkRequest(context), this.getApiKey.bind(this))
      );
      let fullKey = await this.store.get(context.getExtension("hawk").credentials.id);
      return fullKey.canRequest(context.getHttpContext());
    } catch (err) {
      this.log("TRACE", err);
    }
    return false;
  }

  /**
   * @inheritdoc
   */
  static getModda() {
    return {
      uuid: "Webda/Hawk",
      label: "Hawk",
      description: "Implements Hawk API signature"
    };
  }
}

export { HawkService };
