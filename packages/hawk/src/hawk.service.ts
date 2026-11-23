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
import { CacheStorage } from "@webda/cache";
import { createHash, randomBytes } from "node:crypto";
import * as Hawk from "hawk";
import type { ApiKey } from "./apikey.model.js";

/**
 * Reject regular expressions that are overly long or contain nested quantifiers (ReDoS)
 * @param pattern - regex source string
 * @returns compiled anchored RegExp or undefined if unsafe
 */
export function compileSafeAnchoredRegExp(pattern: string): RegExp | undefined {
  if (typeof pattern !== "string" || pattern.length > 512 || /\([^()]*[+*?][^()]*\)[+*?{]/.test(pattern)) {
    return undefined;
  }
  return new RegExp(`^(?:${pattern})$`);
}

/**
 * Hawk Credentials representation
 */
export interface HawkCredentials {
  /**
   * Unique identifier
   */
  id: string;
  /**
   * Key
   */
  key: string;
  /**
   * Algorithm
   */
  algorithm: string;
}
/**
 * Contains the hawk context
 */
export interface HawkContext {
  /**
   * Artifacts
   */
  artifacts: any;
  /**
   * Credentials
   */
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
   * @default []
   */
  redirectUris: string[];
  /**
   * Permitted clock skew of the request timestamps, in seconds, on each side of the server time
   * @default 60
   */
  timestampSkewSec?: number;
  /**
   * Maximum number of request nonces remembered to reject replays
   *
   * The cache is in memory: each instance of a multi-instance deployment only knows its own nonces,
   * so a request replayed on another instance within the clock skew is not detected.
   * Once full, the oldest nonces are forgotten first.
   * @default 100000
   */
  nonceCacheSize?: number;

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.redirectUris ??= [];
    this.timestampSkewSec ??= 60;
    this.nonceCacheSize ??= 100000;
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
  /**
   * Registry entry
   */
  static RegistryEntry = "HawkOrigins";
  /**
   * CryptoService
   */
  @Inject("CryptoService")
  protected cryptoService: CryptoService;
  /**
   * Model to use for apikey
   */
  model?: typeof ApiKey;
  /**
   * Listeners to remove on stop
   */
  protected unsubscribers: (() => void)[] = [];
  /**
   * Nonces already used within the clock skew window
   */
  protected nonces: CacheStorage;

  /**
   * Retrieve the hawk credentials of an api key
   * @param id - the api key id
   * @param _timestamp - used to invalidate cache
   * @returns the hawk credentials
   */
  @InstanceCache()
  async getApiKey(id: string, _timestamp = undefined): Promise<HawkCredentials> {
    if (!this.model) {
      throw new WebdaError.Forbidden("API key model is not configured");
    }
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
      payload: (await http.getRawBody()) || Buffer.alloc(0),
      contentType: http.getUniqueHeader("content-type") || ""
    };
  }

  /**
   * Reject a nonce already used by the same credentials within the clock skew window
   *
   * Used as Hawk `nonceFunc`: it is called once the MAC is verified, so only key holders fill the cache
   * @param id - the credentials id
   * @param key - the credentials key, so that sessions sharing the `session` id do not collide
   * @param nonce - the request nonce
   * @param ts - the request timestamp
   * @throws Error if the nonce was already used
   */
  checkNonce(id: string, key: string, nonce: string, ts: string) {
    const entry = createHash("sha256")
      .update(JSON.stringify([id, key, nonce, ts]))
      .digest("base64");
    if (this.nonces.hasCachedMethod(entry)) {
      throw new Error("Nonce already used");
    }
    this.nonces.setCachedMethod(entry, [], true);
  }

  /**
   * Authenticate a Hawk request, verifying its payload hash and rejecting replays
   *
   * A request with a body must carry a payload hash matching the body.
   * A request without body may omit the hash; if it carries one it must be the hash of an empty payload.
   * @param request - the hawk request
   * @param credentialsFunc - resolve the credentials of an id
   * @returns the hawk credentials and artifacts
   */
  async authenticate(
    request: Awaited<ReturnType<HawkService["getHawkRequest"]>>,
    credentialsFunc: (id: string) => Promise<HawkCredentials>
  ): Promise<HawkContext> {
    let id = "";
    const hasBody = request.payload.length > 0;
    const result = await Hawk.server.authenticate(
      request,
      credentialId => {
        id = credentialId;
        return credentialsFunc(credentialId);
      },
      {
        timestampSkewSec: this.parameters.timestampSkewSec,
        // Passing the payload makes Hawk require the hash and verify it
        ...(hasBody ? { payload: request.payload } : {}),
        nonceFunc: async (key, nonce, ts) => this.checkNonce(id, key, nonce, ts)
      }
    );
    if (!hasBody && result.artifacts.hash) {
      Hawk.server.authenticatePayload("", result.credentials, result.artifacts, request.contentType);
    }
    return result;
  }

  /**
   * Create the nonce cache
   * @returns this
   */
  resolve(): this {
    super.resolve();
    this.nonces = new CacheStorage({
      // A nonce can be replayed as long as its timestamp is within the skew, on either side of the server time
      ttl: this.parameters.timestampSkewSec! * 2000,
      maxSize: this.parameters.nonceCacheSize
    });
    return this;
  }

  /**
   * Add the Request listeners
   * @returns this
   */
  async init(): Promise<this> {
    await super.init();
    this.model = this.parameters.keyModel ? <any>useModel(this.parameters.keyModel) : undefined;
    if (!this.model && !this.parameters.dynamicSessionKey) {
      throw new Error("Model must exists or dynamic session key must be defined");
    }
    if (this.model) {
      // Make sure origins exist
      await this.getOrigins();
      // Keep the origins registry in sync with the keys
      // The inherited model event marker is optional; describe the repository events used here explicitly.
      /**
       * Key event type definition
       */
      type KeyEvent = "Created" | "Updated" | "Patched";
      /**
       * Key listener type definition
       */
      type KeyListener = (event: { object?: ApiKey }) => void;
      const repo = useRepository(this.model) as {
        on(event: KeyEvent, listener: KeyListener): void;
        off(event: KeyEvent, listener: KeyListener): void;
      };
      const update = ({ object }: { object?: ApiKey }) => object?.updateOrigins();
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
      const contentType = String(headers["Content-Type"] || headers["content-type"] || "application/json");
      // Send current time to be able to detect any time synchronization issue
      context.setHeader("x-server-time", Date.now());

      const hawkContext = context.getExtension<HawkContext>("hawk");
      if (hawkContext === undefined) {
        return;
      }
      const header = Hawk.server.header(hawkContext.credentials, hawkContext.artifacts, {
        // Always sign a payload hash, an empty one included, so that a client can detect an injected body
        payload: context.getResponseBody() || "",
        contentType
      });
      // LambdaServer behave a bit different
      context.setHeader("Server-Authorization", header);
    } catch (err) {
      this.log("TRACE", `Hawk init failed : '${err instanceof Error ? err.message : String(err)}'`);
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
    const updatedUrl = new URL(url);
    const isAllowed = this.parameters.redirectUris.some(u => {
      const allowed = new URL(u);
      return `${updatedUrl.origin}${updatedUrl.pathname}/`.startsWith(
        `${allowed.origin}${allowed.pathname.replace(/\/?$/, "/")}`
      );
    });
    if (!isAllowed) {
      throw new WebdaError.Forbidden("Invalid redirect");
    }
    const sessionKey = this.parameters.dynamicSessionKey;
    if (!sessionKey) {
      throw new WebdaError.Forbidden("Dynamic session key is not configured");
    }
    const session = context.getSession();
    let secret: unknown = Reflect.get(session, sessionKey);
    if (secret === undefined || secret === null) {
      secret = `${this.cryptoService.current}.${randomBytes(16).toString("base64")}`;
      Reflect.set(session, sessionKey, secret);
    }
    if (typeof secret !== "string") {
      throw new WebdaError.Forbidden("Invalid session key");
    }
    const [key, data] = secret.split(".");
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
        const regex = compileSafeAnchoredRegExp(pattern);
        if (regex && regex.test(origin)) {
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
        const secret: unknown = Reflect.get(context.getSession(), this.parameters.dynamicSessionKey);
        if (typeof secret !== "string" || !secret) {
          throw new WebdaError.Forbidden("No session key");
        }
        const [key, data] = secret.split(".");
        context.setExtension(
          "hawk",
          await this.authenticate(hawkRequest, async () => ({
            id: "session",
            key: await this.cryptoService.hmac(data, key),
            algorithm: "sha256"
          }))
        );
      } catch (err) {
        if (err instanceof WebdaError.Forbidden) {
          throw err;
        }
        throw new WebdaError.Forbidden(`Hawk error (${err instanceof Error ? err.message : String(err)})`);
      }
    } else if (this.model) {
      // We have an Api Key store
      try {
        context.setExtension("hawk", await this.authenticate(hawkRequest, this.getApiKey.bind(this)));
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
    } else {
      return false;
    }
    return true;
  }
}

export { HawkService };
