import {
  CryptoService,
  Inject,
  OperationContext,
  Route,
  Service,
  ServiceParameters,
  WebdaError,
  useApplication
} from "@webda/core";
import { randomUUID } from "node:crypto";
import { OIDCConfigurationError } from "./errors.js";
import { matchAnyGlob } from "./glob.js";

/**
 * Asymmetric algorithms an issuer can sign with
 */
export type OIDCSigningAlgorithm = "RS256" | "RS384" | "RS512" | "PS256" | "ES256";

/**
 * Supported signing algorithms
 */
const SIGNING_ALGORITHMS: OIDCSigningAlgorithm[] = ["RS256", "RS384", "RS512", "PS256", "ES256"];

/**
 * Claims set by the issuer, an extra claim cannot override them
 */
const RESERVED_CLAIMS = ["iss", "sub", "aud", "exp", "nbf", "iat", "jti", "webda_app"];

/**
 * Check an issuer URL: absolute, https (http only for a loopback host), no query nor fragment
 * @param issuer - the issuer url
 * @returns the reason it is invalid, or undefined
 */
export function checkIssuerUrl(issuer: string): string | undefined {
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    return "must be an absolute URL";
  }
  if (url.search || url.hash) {
    return "must not have a query or a fragment";
  }
  if (url.protocol === "https:") {
    return undefined;
  }
  if (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return undefined;
  }
  return "must use https";
}

/**
 * Parameters of the OIDC issuer
 */
export class OIDCIssuerParameters extends ServiceParameters {
  /**
   * Public issuer URL, MUST be https in production, no trailing slash
   *
   * @example https://orders.example.com
   */
  issuer: string;
  /**
   * Application name, put in `sub` as `app:<name>` and in claim `webda_app`
   *
   * @default application package name
   */
  name: string;
  /**
   * Token lifetime in seconds
   *
   * @default 300
   */
  tokenTtl: number;
  /**
   * Signing algorithm, asymmetric only
   *
   * ES256 requires the CryptoService to generate EC P-256 keys (`asymetricType: "ec"`)
   * @default "RS256"
   */
  algorithm: OIDCSigningAlgorithm;
  /**
   * Allowed audiences patterns (glob), minting for another audience is refused
   *
   * A lone `*` allows any audience, otherwise `*` does not cross `/`: `https://*.example.com`
   * @default ["*"]
   */
  audiences: string[];

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.issuer = this.issuer?.replace(/\/+$/, "");
    this.tokenTtl ??= 300;
    this.algorithm ??= "RS256";
    this.audiences ??= ["*"];
    return this;
  }
}

/**
 * A minted workload token
 */
export interface MintedToken {
  /**
   * The signed JWT
   */
  token: string;
  /**
   * Expiration timestamp in milliseconds
   */
  expiresAt: number;
}

/**
 * Minimal OIDC issuer for the workload identity of this application
 *
 * Publishes `/.well-known/openid-configuration` pointing to the CryptoService JWKS and mints short-lived,
 * audience-scoped tokens with the CryptoService asymmetric keys. Another Webda application trusts it with an
 * `OIDCVerifier`, any OIDC library can verify its tokens from the discovery document.
 *
 * @WebdaModda OIDCIssuer
 */
export class OIDCIssuer<T extends OIDCIssuerParameters = OIDCIssuerParameters> extends Service<T> {
  /**
   * Signing keys and JWKS
   */
  @Inject("CryptoService")
  protected cryptoService: CryptoService;

  /**
   * Validate the configuration
   * @returns this
   */
  resolve(): this {
    super.resolve();
    const { issuer, algorithm, tokenTtl } = this.parameters;
    if (!issuer) {
      throw new OIDCConfigurationError(`${this.getName()}: issuer is required`);
    }
    const invalid = checkIssuerUrl(issuer);
    if (invalid) {
      throw new OIDCConfigurationError(`${this.getName()}: issuer ${invalid}`);
    }
    if (!SIGNING_ALGORITHMS.includes(algorithm)) {
      throw new OIDCConfigurationError(
        `${this.getName()}: algorithm must be one of ${SIGNING_ALGORITHMS.join(", ")}, symmetric algorithms are refused`
      );
    }
    if (!(tokenTtl > 0)) {
      throw new OIDCConfigurationError(`${this.getName()}: tokenTtl must be positive`);
    }
    this.parameters.name ??= useApplication()?.getPackageDescription?.()?.name as string;
    if (!this.parameters.name) {
      throw new OIDCConfigurationError(`${this.getName()}: name is required when the application has no package name`);
    }
    return this;
  }

  /**
   * Check the CryptoService can publish the keys
   * @returns this
   */
  async init(): Promise<this> {
    await super.init();
    if (!this.cryptoService.getJWKSUrl()) {
      throw new OIDCConfigurationError(`${this.getName()}: the CryptoService must have an url to publish its JWKS`);
    }
    const defaultAlgorithm = this.cryptoService.getParameters().jwt?.algorithm;
    // The JWKS advertises the CryptoService asymmetric default algorithm: a different one would not verify
    if (defaultAlgorithm && !defaultAlgorithm.startsWith("HS") && defaultAlgorithm !== this.parameters.algorithm) {
      throw new OIDCConfigurationError(
        `${this.getName()}: algorithm ${this.parameters.algorithm} differs from the CryptoService jwt.algorithm ${defaultAlgorithm}`
      );
    }
    return this;
  }

  /**
   * @returns the issuer url
   */
  getIssuer(): string {
    return this.parameters.issuer;
  }

  /**
   * @returns the subject of the minted tokens
   */
  getSubject(): string {
    return `app:${this.parameters.name}`;
  }

  /**
   * OpenID Provider metadata, limited to what a verifier needs
   * @returns the discovery document
   */
  getDiscoveryDocument() {
    return {
      issuer: this.parameters.issuer,
      jwks_uri: this.parameters.issuer + this.cryptoService.getJWKSUrl(),
      id_token_signing_alg_values_supported: [this.parameters.algorithm],
      subject_types_supported: ["public"],
      response_types_supported: ["id_token"],
      claims_supported: [...RESERVED_CLAIMS]
    };
  }

  /**
   * Serve the OpenID discovery document
   * @param context - the request context
   */
  @Route("/.well-known/openid-configuration", ["GET"], {
    description: "OpenID Connect discovery document",
    get: {
      operationId: "getOpenIDConfiguration"
    }
  })
  async serveDiscovery(context: OperationContext) {
    context.setHeader("Cache-Control", `public, max-age=${this.cryptoService.getJWKSMaxAge()}`);
    context.write(this.getDiscoveryDocument());
  }

  /**
   * Mint a workload token for an audience
   * @param audience - the target audience, usually the public URL of the called application
   * @param extraClaims - additional claims, the registered ones (`iss`, `sub`, `aud`, ...) cannot be overridden
   * @returns the token and its expiration
   * @throws WebdaError.Forbidden when the audience is not allowed
   */
  async mint(audience: string, extraClaims: Record<string, unknown> = {}): Promise<MintedToken> {
    if (typeof audience !== "string" || !audience) {
      throw new WebdaError.BadRequest("audience is required");
    }
    if (!matchAnyGlob(audience, this.parameters.audiences)) {
      throw new WebdaError.Forbidden(`Audience ${audience} is not allowed`);
    }
    const claims: Record<string, unknown> = { ...extraClaims };
    RESERVED_CLAIMS.forEach(claim => delete claims[claim]);
    const now = Math.floor(Date.now() / 1000);
    const token = await this.cryptoService.jwtSign(
      { ...claims, webda_app: this.parameters.name, jti: randomUUID(), iat: now, nbf: now },
      {
        algorithm: this.parameters.algorithm,
        audience,
        issuer: this.parameters.issuer,
        subject: this.getSubject(),
        expiresIn: this.parameters.tokenTtl
      }
    );
    return { token, expiresAt: (now + this.parameters.tokenTtl) * 1000 };
  }
}
