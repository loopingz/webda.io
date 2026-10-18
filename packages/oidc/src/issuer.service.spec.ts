import {
  callOperation,
  registerOperation,
  Service,
  unregisterOperationAuthorizer,
  useCore,
  useCrypto,
  useService,
  WebContext,
  WebdaError
} from "@webda/core";
import { IAMService, IAMServiceParameters } from "@webda/iam";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as jose from "jose";
import { AUDIENCE, OIDCTest } from "../test/fixture.js";
import { OIDCConfigurationError } from "./errors.js";
import { useOIDCClient, useOIDCIssuer } from "./hooks.js";
import { OIDCIssuer } from "./issuer.service.js";
import { OIDCVerifier } from "./verifier.service.js";

const ORDERS = "https://orders.example.com";

/**
 * Operations of the billing application
 */
class BillingOps extends Service {
  async run(): Promise<string> {
    return "ok";
  }
}

@suite
class OIDCIssuerTest extends OIDCTest {
  /**
   * Call a route of this application
   * @param url - the path
   * @returns the parsed body and the context
   */
  async get(url: string) {
    const ctx = await this.newContext<WebContext>();
    const body = await this.execute(ctx, "orders.example.com", "GET", url);
    return { body, ctx };
  }

  /**
   * Serve this application routes to fetch, as if it was reachable at ORDERS
   * @returns the urls fetched
   */
  serveOverFetch(): string[] {
    const calls: string[] = [];
    this.stub(globalThis, "fetch").callsFake(async (input: any) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      calls.push(url.href);
      if (url.origin !== ORDERS) {
        return new Response("not found", { status: 404 });
      }
      return Response.json((await this.get(url.pathname)).body);
    });
    return calls;
  }

  @test
  async discoveryDocument() {
    const { body, ctx } = await this.get("/.well-known/openid-configuration");
    assert.deepStrictEqual(body, {
      issuer: ORDERS,
      jwks_uri: `${ORDERS}/jwks`,
      id_token_signing_alg_values_supported: ["RS256"],
      subject_types_supported: ["public"],
      response_types_supported: ["id_token"],
      claims_supported: ["iss", "sub", "aud", "exp", "nbf", "iat", "jti", "webda_app"]
    });
    assert.match(String(ctx.getResponseHeaders()["Cache-Control"]), /^public, max-age=\d+$/);
    const jwks = (await this.get("/jwks")).body;
    assert.ok(jwks.keys.length > 0);
    assert.ok(jwks.keys.every(k => k.kty === "RSA" && k.use === "sig" && !k.d && !k.k));
  }

  @test
  async mintVerifiedByThirdParty() {
    this.serveOverFetch();
    const { token, expiresAt } = await useOIDCIssuer().mint(AUDIENCE, {
      team: "core",
      sub: "app:admin",
      iss: "https://evil.example.com",
      aud: "x",
      exp: 9999999999
    });
    // Any OIDC library: discovery, then its jwks_uri
    const discovery = await (await fetch(`${ORDERS}/.well-known/openid-configuration`)).json();
    const { payload, protectedHeader } = await jose.jwtVerify(
      token,
      jose.createRemoteJWKSet(new URL(discovery.jwks_uri)),
      { issuer: discovery.issuer, audience: AUDIENCE, algorithms: discovery.id_token_signing_alg_values_supported }
    );
    assert.strictEqual(protectedHeader.alg, "RS256");
    assert.strictEqual(protectedHeader.kid, `A${useCrypto().current}`);
    // Registered claims cannot be overridden
    assert.strictEqual(payload.iss, ORDERS);
    assert.strictEqual(payload.sub, "app:orders");
    assert.strictEqual(payload.aud, AUDIENCE);
    assert.strictEqual(payload.webda_app, "orders");
    assert.strictEqual(payload.team, "core");
    assert.strictEqual(payload.exp - payload.iat, 300);
    assert.strictEqual(payload.nbf, payload.iat);
    assert.ok(typeof payload.jti === "string");
    assert.strictEqual(expiresAt, payload.exp * 1000);
  }

  @test
  async audiences() {
    const issuer = useOIDCIssuer();
    await issuer.mint("https://api.internal.example.com");
    await assert.rejects(() => issuer.mint("https://evil.example.com"), WebdaError.Forbidden);
    await assert.rejects(() => issuer.mint("https://a.b.internal.example.com/x"), WebdaError.Forbidden);
    await assert.rejects(() => issuer.mint(""), WebdaError.BadRequest);
  }

  @test
  async configuration() {
    const invalid: any[] = [
      {},
      { issuer: "orders" },
      { issuer: "http://orders.example.com" },
      { issuer: `${ORDERS}?x=1` },
      { issuer: ORDERS, algorithm: "HS256" },
      { issuer: ORDERS, algorithm: "none" },
      { issuer: ORDERS, tokenTtl: 0 }
    ];
    for (const params of invalid) {
      await assert.rejects(
        () => this.addService(OIDCIssuer, { name: "x", ...params }, "OtherIssuer"),
        OIDCConfigurationError,
        JSON.stringify(params)
      );
    }
    // Loopback http and trailing slash
    const local = await this.addService(OIDCIssuer, { issuer: "http://localhost:18080/", name: "x" }, "OtherIssuer");
    assert.strictEqual(local.getIssuer(), "http://localhost:18080");
    // The JWKS must be published
    const crypto = useCrypto();
    const params: any = crypto.getParameters();
    const url = params.url;
    try {
      params.url = undefined;
      await assert.rejects(
        () => this.addService(OIDCIssuer, { issuer: ORDERS, name: "x" }, "OtherIssuer"),
        OIDCConfigurationError
      );
      params.url = url;
      // The JWKS advertises the CryptoService algorithm: the issuer must use the same
      params.jwt.algorithm = "RS384";
      await assert.rejects(
        () => this.addService(OIDCIssuer, { issuer: ORDERS, name: "x", algorithm: "RS256" }, "OtherIssuer"),
        OIDCConfigurationError
      );
      await this.addService(OIDCIssuer, { issuer: ORDERS, name: "x", algorithm: "RS384" }, "OtherIssuer");
    } finally {
      params.url = url;
      params.jwt.algorithm = "HS256";
      delete useCore().getServices()["OtherIssuer"];
    }
  }

  @test
  async applicationCallsApplication() {
    const calls = this.serveOverFetch();
    // Billing trusts orders: same process, the HTTP calls go through the fetch stub
    const verifier = await this.addService(
      OIDCVerifier,
      { audience: AUDIENCE, trustedIssuers: [{ issuer: ORDERS, claims: { sub: "app:orders" } }] } as any,
      "OIDCVerifier"
    );
    (IAMService as any).createConfiguration = (params: any = {}) => new IAMServiceParameters().load(params);
    useCore().getServices()["BillingOps"] = new BillingOps("BillingOps", {} as any);
    registerOperation("Invoices.Create", { service: "BillingOps", method: "run", output: "void" } as any);
    registerOperation("Invoices.Delete", { service: "BillingOps", method: "run", output: "void" } as any);
    const iam = await this.addService(
      IAMService,
      {
        reloadDelay: 0,
        reloadInterval: 0,
        scope: ["Invoices.*"],
        policies: [{ name: "InvoiceWriter", statements: [{ effect: "allow", operations: ["Invoices.Create"] }] }],
        attachments: { "app:orders": ["InvoiceWriter"] }
      } as any,
      "IAM"
    );
    try {
      const client = useOIDCClient();
      const token = await client.getToken(AUDIENCE);
      assert.strictEqual(await client.getToken(AUDIENCE), token, "cached");
      const ctx = await this.newContext<WebContext>();
      ctx.getHttpContext().headers["authorization"] = `Bearer ${token}`;
      const session = await useService("SessionManager").load(ctx);
      ctx.setSession(session);
      assert.strictEqual(session.application.principal, "orders");
      assert.strictEqual(session.application.issuer, ORDERS);
      // IAM sees app:orders
      await callOperation(ctx, "Invoices.Create");
      await assert.rejects(() => callOperation(ctx, "Invoices.Delete"), WebdaError.Forbidden);
      // The verifier fetched the discovery document and the JWKS of orders
      assert.deepStrictEqual(calls, [`${ORDERS}/.well-known/openid-configuration`, `${ORDERS}/jwks`]);

      // Key rotation: the old token still verifies, the new one uses the new kid
      const crypto = useCrypto();
      const previous = crypto.current;
      this.stub(crypto, "getNextId").callsFake(() => {
        const age = parseInt(crypto.current, 36) + 10;
        return { age, id: age.toString(36) };
      });
      await crypto.rotate();
      client.clearCache();
      const rotated = await client.getToken(AUDIENCE);
      assert.strictEqual(jose.decodeProtectedHeader(rotated).kid, `A${crypto.current}`);
      assert.notStrictEqual(crypto.current, previous);
      assert.ok(await verifier.verify(token), "old token");
      // After the JWKS cooldown the unknown kid is fetched
      this.stub(Date, "now").returns(Date.now() + 31_000);
      assert.ok(await verifier.verify(rotated), "new token");
    } finally {
      await iam.stop();
      unregisterOperationAuthorizer((iam as any).authorizer);
      delete useCore().getServices()["IAM"];
      await verifier.stop();
    }
  }
}
