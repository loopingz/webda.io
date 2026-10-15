import { createHash, randomBytes } from "node:crypto";
import {
  callOperation,
  HttpContext,
  listOperations,
  runWithContext,
  useRouter,
  type HttpMethodType,
  type WebContext
} from "@webda/core";
import { AuthTest } from "@webda/auth/lib/test/authtest.js";

/** A browser: a session (cookie session) and the other cookies it holds */
export interface Browser {
  /** Context holding the session */
  ctx: WebContext;
  /** Cookies sent with each request */
  jar: Record<string, string>;
  /** Path attribute of each cookie: a cookie is only sent below its path */
  paths: Record<string, string>;
  /** PKCE verifier of the last authorization request */
  verifier?: string;
}

/** Response of a request */
export interface BrowserResponse {
  /** HTTP status */
  status: number;
  /** Response headers */
  headers: Record<string, any>;
  /** Parsed JSON body, or the raw text */
  body: any;
  /** Cookies set by the response */
  cookies: Record<string, { name: string; value: string; options: any }>;
  /** Context of the request */
  ctx: WebContext;
}

/**
 * @param location - a redirect
 * @returns its query parameters
 */
export const query = (location: string): Record<string, string> =>
  Object.fromEntries(new URL(location, "http://test.webda.io").searchParams.entries());

/**
 * Base class for @webda/oauth specs: an application with Authentication and an OAuthServer, and a browser
 * simulation going through the router
 */
export abstract class OAuthTest extends AuthTest {
  /** @override */
  getTestConfiguration(): any {
    return {
      parameters: { ignoreBeans: true },
      services: {
        AuthStore: {
          type: "Webda/MemoryStore",
          models: [
            "Webda/User",
            "Webda/Ident",
            "Webda/RefreshToken",
            "Webda/RevokedAccess",
            "Webda/OAuthCode",
            "Webda/OAuthDeviceCode",
            "Webda/OAuthGrant"
          ]
        },
        Authentication: { type: "Webda/Authentication" },
        OAuthServer: {
          type: "Webda/OAuthServer",
          loginUrl: "/login",
          clients: {
            app: {
              name: "App",
              redirect_uris: ["http://127.0.0.1/callback", "loopcenter://auth/callback"],
              allowedScopes: "Task.* offline_access"
            }
          }
        }
      }
    };
  }

  /** @override */
  async beforeEach() {
    await super.beforeEach();
    // The HTTP server maps the routes before listening; requests here go straight to the router
    useRouter().remapRoutes();
  }

  /**
   * @returns a new browser with an empty session
   */
  async browser(): Promise<Browser> {
    return { ctx: await this.ctx(), jar: {}, paths: {} };
  }

  /**
   * Send a request like a browser: its session and cookies go with the request, the cookies of the response update
   * the jar
   * @param browser - browser
   * @param method - HTTP method
   * @param path - path
   * @param params - query parameters (GET) or form body (POST)
   * @returns the response
   */
  async request(
    browser: Browser,
    method: HttpMethodType,
    path: string,
    params: Record<string, string | undefined> = {}
  ): Promise<BrowserResponse> {
    const search = new URLSearchParams(
      Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined)
    ).toString();
    const url = method === "GET" && search ? `${path}?${search}` : path;
    const headers = this.cookieHeader(browser, path);
    if (method !== "GET") headers["content-type"] = "application/x-www-form-urlencoded";
    const http = new HttpContext("test.webda.io", method, url, "http", 80, headers);
    if (method !== "GET") http.setBody(search);
    http.setClientIp("127.0.0.1");
    const call = await this.newWebContext<WebContext>(http);
    call.setSession(browser.ctx.getSession());
    await runWithContext(call, () => useRouter().execute(call));
    return this.receive(browser, call);
  }

  /**
   * @param browser - browser
   * @param path - path of the request
   * @returns the Cookie header the browser sends to the path
   */
  protected cookieHeader(browser: Browser, path: string): Record<string, string> {
    const cookie = Object.entries(browser.jar)
      .filter(([k]) => path.startsWith(browser.paths[k] ?? "/"))
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    return cookie ? { cookie } : {};
  }

  /**
   * Update the browser from a finished request: its session and the cookies set by the response
   * @param browser - browser
   * @param call - context of the request
   * @returns the response
   */
  protected receive(browser: Browser, call: WebContext): BrowserResponse {
    browser.ctx.setSession(call.getSession());
    const cookies: BrowserResponse["cookies"] = (call.getResponseCookies() as any) ?? {};
    for (const set of Object.values(cookies)) {
      if (set.value && set.options?.maxAge > 0) {
        browser.jar[set.name] = set.value;
        browser.paths[set.name] = set.options.path ?? "/";
      } else if ((set.options?.path ?? "/") === (browser.paths[set.name] ?? "/")) {
        // A clearing cookie only replaces the cookie of the same path
        delete browser.jar[set.name];
      }
    }
    const raw = call.getResponseBody();
    let body: any = raw ? raw.toString() : undefined;
    try {
      body = body !== undefined ? JSON.parse(body) : undefined;
    } catch {
      // Not JSON
    }
    return { status: call.statusCode, headers: call.getResponseHeaders() as any, body, cookies, ctx: call };
  }

  /**
   * Call an operation by id (see AuthTest), or, with a browser first, call it like a browser on its REST route: the
   * request goes to the path of the operation's `rest` hint, so only the cookies of that path are sent. Errors are
   * thrown, the response cookies update the jar
   * @param args - `(browser, operationId, input?)` or the arguments of AuthTest.op
   * @returns parsed output
   */
  op<T = any>(
    operationId: string,
    input?: any,
    ctx?: WebContext,
    headers?: Record<string, string>
  ): Promise<T | undefined>;
  op<T = any>(browser: Browser, operationId: string, input?: any): Promise<T | undefined>;
  async op(...args: any[]): Promise<any> {
    if (typeof args[0] === "string") return super.op(...(args as Parameters<AuthTest["op"]>));
    const [browser, operationId, input] = args as [Browser, string, any];
    const rest = listOperations()[operationId]?.rest;
    const path = typeof rest === "object" ? `/${rest.path.replace(/^\//, "")}` : "/";
    const method = (typeof rest === "object" ? rest.method.toUpperCase() : "POST") as HttpMethodType;
    const headers = this.cookieHeader(browser, path);
    if (method !== "GET") headers["content-type"] = "application/json";
    const http = new HttpContext("test.webda.io", method, path, "http", 80, headers);
    if (method !== "GET") http.setBody(JSON.stringify(input ?? {}));
    http.setClientIp("127.0.0.1");
    const call = await this.newWebContext<WebContext>(http);
    call.setSession(browser.ctx.getSession());
    try {
      await runWithContext(call, () => callOperation(call, operationId));
    } catch (err) {
      // Like the HTTP response: the status code is part of what the browser sees
      const status = (err as any)?.getResponseCode?.();
      if (status) (err as Error).message = `${status} ${(err as Error).message}`;
      throw err;
    } finally {
      browser.ctx.setSession(call.getSession());
    }
    return this.receive(browser, call).body;
  }

  /**
   * @param browser - browser
   * @param path - path
   * @param params - query parameters
   * @returns the response
   */
  get(browser: Browser, path: string, params: Record<string, string | undefined> = {}): Promise<BrowserResponse> {
    return this.request(browser, "GET", path, params);
  }

  /**
   * @param browser - browser
   * @param path - path
   * @param body - form body
   * @returns the response
   */
  post(browser: Browser, path: string, body: Record<string, string | undefined> = {}): Promise<BrowserResponse> {
    return this.request(browser, "POST", path, body);
  }

  /**
   * Log the browser session in
   * @param browser - browser
   * @param userId - user
   */
  async login(browser: Browser, userId: string): Promise<void> {
    browser.ctx.getSession().login(userId, `${userId}@email`, { provider: "email", amr: ["pwd"] });
  }

  /**
   * @returns a PKCE verifier and its S256 challenge
   */
  pkce(): { verifier: string; challenge: string } {
    const verifier = randomBytes(32).toString("base64url");
    return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
  }

  /**
   * Start a valid authorization request for the `app` client; the verifier is kept on the browser
   * @param browser - browser
   * @param extra - parameters to add or override
   * @returns the response
   */
  async authorize(browser: Browser, extra: Record<string, string | undefined> = {}): Promise<BrowserResponse> {
    const { verifier, challenge } = this.pkce();
    browser.verifier = verifier;
    return this.get(browser, "/oauth/authorize", {
      response_type: "code",
      client_id: "app",
      redirect_uri: "http://127.0.0.1:1234/callback",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "s",
      ...extra
    });
  }
}
