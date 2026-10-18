import { suite, test } from "@webda/test";
import * as assert from "assert";
import { createHash, randomBytes } from "node:crypto";
import { registerOperation, useContext, useInstanceStorage, useRouter, useService, WebdaError } from "@webda/core";
import { HttpServer } from "@webda/core/lib/services/httpserver.service.js";
import { OAuthTest, registerTestOperations, unregisterTestOperations } from "./test/oauthtest.js";

/** A cookie jar: name → value and path */
type Jar = Record<string, { value: string; path: string }>;

/**
 * The whole delegation through a real HTTP server and the router only: no operation is called directly
 */
@suite
class OAuthEndToEndTest extends OAuthTest {
  /** Base URL of the HTTP server */
  base: string;

  /** @override */
  getTestConfiguration(): any {
    const config = super.getTestConfiguration();
    // Only the operation-id transport: the built-in pages work without any REST transport
    config.services.HttpServer = { type: "Webda/HttpServer", port: 0 };
    config.services.Operations = { type: "Webda/OperationsTransport" };
    return config;
  }

  /** @override */
  async tweakApp(app: any): Promise<void> {
    await super.tweakApp(app);
    app.addModda("Webda/HttpServer", HttpServer);
  }

  /** @override */
  async beforeEach() {
    await super.beforeEach();
    registerTestOperations();
    const server: any = useService("OAuthServer");
    // An operation of the delegated scope that needs a logged-in caller
    server.whoami = async () => {
      const session = useContext().getSession();
      if (!session?.isLogged()) throw new WebdaError.Unauthorized("Login required");
      return { userId: session.userId };
    };
    registerOperation("Task.Whoami", { service: "OAuthServer", method: "whoami" } as any);
    // The login page of the application: logs the browser in and goes back
    server.addRoute("/login{?redirect}", ["GET"], async ctx => {
      ctx.getSession().login("u1", "u1@email", { provider: "email", amr: ["pwd"] });
      ctx.redirect(ctx.parameter("redirect"));
    });
    useRouter().remapRoutes();
    const http: any = useService("HttpServer" as any);
    if (!http.server?.listening) {
      await http.start("127.0.0.1", 0);
      for (let i = 0; i < 100 && !http.server?.listening; i++) await new Promise(r => setTimeout(r, 20));
    }
    this.base = `http://127.0.0.1:${http.server.address().port}`;
  }

  /** @override */
  async afterEach() {
    unregisterTestOperations();
    delete useInstanceStorage().operations["Task.Whoami"];
    await super.afterEach();
  }

  /**
   * Send a request like a browser: the cookies of the path go with it, the ones set by the response fill the jar
   * @param jar - cookie jar
   * @param url - absolute URL or path
   * @param init - fetch options
   * @returns the response
   */
  async browse(jar: Jar, url: string, init: RequestInit = {}): Promise<Response> {
    const target = new URL(url, this.base);
    const cookie = Object.entries(jar)
      .filter(([, c]) => target.pathname.startsWith(c.path))
      .map(([name, c]) => `${name}=${c.value}`)
      .join("; ");
    const res = await fetch(target, {
      ...init,
      redirect: "manual",
      headers: { ...(init.headers as any), ...(cookie ? { cookie } : {}) }
    });
    for (const header of res.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(";").map(p => p.trim());
      const [name, ...value] = pair.split("=");
      const path = attributes.find(a => /^path=/i.test(a))?.slice(5) ?? "/";
      const expired = attributes.some(a => /^max-age=(0|-)/i.test(a) || /^expires=thu, 01 jan 1970/i.test(a));
      if (expired || value.join("=") === "") delete jar[name];
      else jar[name] = { value: value.join("="), path };
    }
    return res;
  }

  /**
   * @param fields - form fields
   * @returns the POST options of a form-encoded body
   */
  form(fields: Record<string, string>): RequestInit {
    return {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString()
    };
  }

  /**
   * @param token - access token
   * @param id - operation
   * @returns the response of the operation-id transport
   */
  callOperation(token: string, id: string): Promise<Response> {
    return fetch(`${this.base}/operations/${id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}"
    });
  }

  @test
  async delegationThroughTheRouter() {
    const jar: Jar = {};
    const verifier = randomBytes(32).toString("base64url");
    const redirectUri = "http://127.0.0.1:1234/callback";
    // Authorize: not logged in, the pending request goes to its cookie and the browser to the login page
    const authorize = await this.browse(
      jar,
      `/oauth/authorize?${new URLSearchParams({
        response_type: "code",
        client_id: "app",
        redirect_uri: redirectUri,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
        state: "st",
        scope: "Task.* offline_access"
      })}`
    );
    assert.strictEqual(authorize.status, 302);
    assert.ok(jar.webda_oauth_pending, Object.keys(jar).join(","));
    assert.strictEqual(jar.webda_oauth_pending.path, "/oauth");
    // Login, then back to the built-in consent page
    const login = await this.browse(jar, authorize.headers.get("location")!);
    assert.strictEqual(login.status, 302);
    const consentPage = await this.browse(jar, login.headers.get("location")!);
    assert.strictEqual(consentPage.status, 200);
    assert.ok((await consentPage.text()).includes('data-api="/oauth"'));
    // What the page script does: fetch the request, then send the decision
    const request = await this.browse(jar, "/oauth/consent/request");
    assert.strictEqual(request.status, 200);
    const req = await request.json();
    assert.strictEqual(req.client.id, "app");
    const ids = req.operations.flatMap((g: any) => g.ids.map((i: any) => i.id));
    assert.ok(ids.includes("Task.Whoami"), ids.join(","));
    const decide = await this.browse(jar, "/oauth/consent/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allow: true, operations: ids, csrf: req.csrf })
    });
    assert.strictEqual(decide.status, 200);
    const callback = new URL((await decide.json()).redirect);
    assert.strictEqual(callback.searchParams.get("state"), "st");
    // Token
    const token = await fetch(
      `${this.base}/oauth/token`,
      this.form({
        grant_type: "authorization_code",
        code: callback.searchParams.get("code")!,
        code_verifier: verifier,
        client_id: "app",
        redirect_uri: redirectUri
      })
    );
    assert.strictEqual(token.status, 200);
    const tokens = await token.json();
    assert.strictEqual(tokens.scope, "Task.* offline_access");
    // In scope, through the operation-id transport
    const listing = await fetch(`${this.base}/operations`, {
      headers: { authorization: `Bearer ${tokens.access_token}` }
    });
    const listed = await listing.json();
    assert.match(listed.version, /^[0-9a-f]{16}$/);
    assert.ok(listed.operations["Task.Whoami"]);
    assert.strictEqual(listed.operations["User.Me"], undefined);
    const inScope = await this.callOperation(tokens.access_token, "Task.Whoami");
    assert.strictEqual(inScope.status, 200);
    assert.deepStrictEqual(await inScope.json(), { userId: "u1" });
    // Out of scope: RFC 6750 insufficient_scope
    const outOfScope = await this.callOperation(tokens.access_token, "User.Me");
    assert.strictEqual(outOfScope.status, 403);
    assert.strictEqual((await outOfScope.json()).error, "insufficient_scope");
    assert.strictEqual(
      outOfScope.headers.get("www-authenticate"),
      'Bearer error="insufficient_scope", scope="User.Me"'
    );
    // Refresh
    const refresh = await fetch(
      `${this.base}/oauth/token`,
      this.form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: "app" })
    );
    assert.strictEqual(refresh.status, 200);
    const refreshed = await refresh.json();
    assert.strictEqual((await this.callOperation(refreshed.access_token, "Task.Whoami")).status, 200);
    // Revoke: the whole family, so the refreshed access token too
    const revoke = await fetch(
      `${this.base}/oauth/revoke`,
      this.form({ token: refreshed.refresh_token, client_id: "app" })
    );
    assert.strictEqual(revoke.status, 200);
    assert.strictEqual((await this.callOperation(refreshed.access_token, "Task.Whoami")).status, 401);
    assert.strictEqual((await this.callOperation(tokens.access_token, "Task.Whoami")).status, 401);
  }
}
