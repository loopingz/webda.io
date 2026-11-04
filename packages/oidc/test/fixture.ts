import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import * as jose from "jose";
import { OIDCClient, OIDCClientParameters } from "../src/client.service.js";
import { OIDCIssuer, OIDCIssuerParameters } from "../src/issuer.service.js";
import { OIDCVerifier, OIDCVerifierParameters } from "../src/verifier.service.js";

/**
 * External issuer of the tests
 */
export const ISSUER = "https://issuer.example.com";
/**
 * Audience of this application
 */
export const AUDIENCE = "https://billing.example.com";

/**
 * Base test registering the OIDC services from sources
 */
export class OIDCTest extends WebdaApplicationTest {
  /**
   * Use the sources classes
   * @param app - the test application
   */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    for (const [name, service, parameters] of <[string, any, any][]>[
      ["Webda/OIDCIssuer", OIDCIssuer, OIDCIssuerParameters],
      ["Webda/OIDCVerifier", OIDCVerifier, OIDCVerifierParameters],
      ["Webda/OIDCClient", OIDCClient, OIDCClientParameters]
    ]) {
      service.createConfiguration = (params: any = {}) => new parameters().load(params);
      app.addModda(name, service);
    }
  }

  /**
   * Register a verifier
   * @param params - the verifier parameters
   * @returns the verifier
   */
  async addVerifier(params: Partial<OIDCVerifierParameters>): Promise<OIDCVerifier> {
    return this.addService(OIDCVerifier, { audience: AUDIENCE, ...params } as any, "OIDCVerifier");
  }
}

/**
 * A fake OIDC provider: keys, discovery and JWKS served through a fetch stub
 */
export class FakeIdP {
  /**
   * Signing keys by kid
   */
  keys = new Map<string, { privateKey: jose.CryptoKey; jwk: jose.JWK }>();
  /**
   * Urls fetched
   */
  calls: string[] = [];
  /**
   * Discovery document override
   */
  discovery?: any;
  /**
   * Serve the discovery as RFC 8414 authorization server metadata only, like an OAuthServer
   */
  oauthMetadataOnly = false;

  /**
   * @param issuer - the issuer url
   */
  constructor(public issuer: string = ISSUER) {}

  /**
   * Add a signing key
   * @param kid - the key id
   * @param alg - the algorithm
   * @returns this
   */
  async addKey(kid: string, alg: string = "RS256"): Promise<this> {
    const { privateKey, publicKey } = await jose.generateKeyPair(alg, { extractable: true });
    this.keys.set(kid, { privateKey, jwk: { ...(await jose.exportJWK(publicKey)), kid, alg, use: "sig" } });
    return this;
  }

  /**
   * Sign a token, valid for AUDIENCE by default
   * @param claims - payload claims, override the defaults
   * @param header - protected header, kid defaults to the first key
   * @returns the JWT
   */
  async sign(claims: Record<string, unknown> = {}, header: Partial<jose.JWTHeaderParameters> = {}): Promise<string> {
    const kid = header.kid ?? [...this.keys.keys()][0];
    const key = this.keys.get(kid) ?? [...this.keys.values()][0];
    const now = Math.floor(Date.now() / 1000);
    return new jose.SignJWT({
      iss: this.issuer,
      aud: AUDIENCE,
      sub: "app:orders",
      iat: now,
      nbf: now,
      exp: now + 300,
      ...claims
    } as jose.JWTPayload)
      .setProtectedHeader({ alg: key.jwk.alg as string, kid, ...header })
      .sign(key.privateKey);
  }

  /**
   * fetch implementation serving the discovery and the JWKS
   * @param input - the url
   * @returns the response
   */
  fetch = async (input: any): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    this.calls.push(url);
    if (url === `${this.issuer}/.well-known/oauth-authorization-server` && this.oauthMetadataOnly) {
      return Response.json(this.discovery ?? { issuer: this.issuer, jwks_uri: `${this.issuer}/jwks` });
    }
    if (url === `${this.issuer}/.well-known/openid-configuration` && !this.oauthMetadataOnly) {
      return Response.json(this.discovery ?? { issuer: this.issuer, jwks_uri: `${this.issuer}/jwks` });
    }
    if (url === `${this.issuer}/jwks`) {
      return Response.json({ keys: [...this.keys.values()].map(k => k.jwk) });
    }
    return new Response("not found", { status: 404 });
  };

  /**
   * @returns the number of JWKS requests
   */
  jwksCalls(): number {
    return this.calls.filter(url => url.endsWith("/jwks")).length;
  }
}
