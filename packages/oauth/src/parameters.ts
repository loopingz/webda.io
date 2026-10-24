import { ServiceParameters, WebdaError } from "@webda/core";

/** OAuth client definition */
export interface OAuthClient {
  /** client_id */
  id: string;
  /** Display name */
  name: string;
  /** Allowed redirect URIs; loopback http URIs match any port */
  redirect_uris: string[];
  /** Logo URL */
  logo?: string;
  /** Home page */
  client_uri?: string;
  /** Scope when the request has none */
  defaultScope?: string;
  /** Maximum scope ever granted */
  allowedScopes?: string;
  /**
   * Resource the tokens are bound to when the request names none (RFC 8707): the absolute URI of a registered
   * protected resource
   */
  defaultResource?: string;
  /** Device authorization grant allowed */
  deviceFlow?: boolean;
  /** Loaded from a Client ID Metadata Document */
  metadataDocument?: boolean;
  /** Registered dynamically (RFC 7591) */
  registered?: boolean;
}

/** Built-in Webda CLI client */
export const WEBDA_CLI_CLIENT: Omit<OAuthClient, "id"> = {
  name: "Webda CLI",
  redirect_uris: ["http://127.0.0.1/callback"],
  deviceFlow: true,
  defaultScope: "* offline_access"
};

/**
 * Validate a statically configured client
 *
 * @param id - client_id
 * @param client - definition
 * @throws CodeError when the definition is invalid
 */
export function validateClient(id: string, client: any): void {
  const fail = (reason: string) => {
    throw new WebdaError.CodeError("OAUTH_INVALID_CLIENT", `Invalid OAuth client "${id}": ${reason}`);
  };
  if (!id) fail("empty client id");
  if (typeof client !== "object" || Array.isArray(client)) fail("definition must be an object or null");
  if (typeof client.name !== "string" || !client.name) fail("name must be a non-empty string");
  if (!Array.isArray(client.redirect_uris) || !client.redirect_uris.every((u: unknown) => typeof u === "string")) {
    fail("redirect_uris must be an array of strings");
  }
  if (client.defaultResource !== undefined && !isHttpUrl(client.defaultResource)) {
    fail("defaultResource must be an absolute http(s) URL");
  }
}

/**
 * @param value - value to check
 * @returns true when it is an absolute http or https URL
 */
function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** OAuthServer parameters */
export class OAuthServerParameters extends ServiceParameters {
  /** @default "/oauth" */
  url: string;
  /**
   * Issuer; defaults to the request origin. When set, the access tokens carry it as `iss` with the RFC 9068
   * `at+jwt` type, so another application can verify them (see `resources`)
   */
  issuer?: string;
  /**
   * Protected resources served by other applications (absolute URIs, RFC 8707): accepted as a `resource` or a client
   * `defaultResource`, never chosen by default. Their tokens are verified from the issuer keys, so they require
   * `issuer`, an asymmetric `CryptoService` algorithm and its published JWKS (`url`)
   * @default []
   */
  resources: string[];
  /** Static clients by id; `null` removes a built-in client */
  clients: Record<string, Omit<OAuthClient, "id"> | null>;
  /** @default true */
  clientMetadataDocuments: boolean;
  /**
   * Hosts allowed to serve Client ID Metadata Documents.
   * Empty (default): any public host is accepted. Non-empty: only these hosts are accepted, and they bypass the
   * private address check (so internal hosts can be listed)
   */
  clientMetadataHosts: string[];
  /** @default 5 */
  clientMetadataTimeout: number;
  /** @default 3600 */
  clientMetadataCacheTtl: number;
  /** Application login page, receives `?redirect=` */
  loginUrl: string;
  /** Consent UI; defaults to the built-in page */
  consentUrl?: string;
  /** Device code entry UI; defaults to the built-in page */
  deviceUrl?: string;
  /** Result UI; defaults to the built-in page */
  resultUrl?: string;
  /** Access token lifetime (s); defaults to TokenService */
  accessTtl?: number;
  /** Refresh token lifetime (s); defaults to TokenService */
  refreshTtl?: number;
  /** @default 60 */
  codeTtl: number;
  /** @default 600 */
  deviceCodeTtl: number;
  /** @default 5 */
  devicePollInterval: number;
  /** @default true */
  rememberConsent: boolean;
  /** @default 7776000 */
  rememberConsentTtl: number;
  /** Lifetime of a registered client never used (s)
   * @default 86400 */
  registrationUnusedTtl: number;
  /** Lifetime of a registered client since its last use (s)
   * @default 7776000 */
  registrationIdleTtl: number;
  /** Dynamic client registration (RFC 7591); defaults to `open` when a protected resource is registered, else `off` */
  registration?: "open" | "off";
  /** Globs every redirect URI of a registration must match one of */
  registrationRedirectPatterns?: string[];
  /** Registrations allowed per client IP in the window
   * @default 20 */
  registrationRateLimit: number;
  /** Window of the registration rate limit (s)
   * @default 3600 */
  registrationRateWindow: number;
  /** Advertised scopes; defaults to the top-level operation groups */
  scopesSupported?: string[];

  /**
   * @param params - raw parameters
   * @returns this
   * @override
   */
  load(params: any = {}): this {
    super.load(params);
    this.url ??= "/oauth";
    this.clients = { "webda-cli": WEBDA_CLI_CLIENT, ...(this.clients ?? {}) };
    for (const [id, client] of Object.entries(this.clients)) {
      if (client !== null) validateClient(id, client);
    }
    this.resources ??= [];
    this.clientMetadataDocuments ??= true;
    this.clientMetadataHosts ??= [];
    this.clientMetadataTimeout ??= 5;
    this.clientMetadataCacheTtl ??= 3600;
    this.codeTtl ??= 60;
    this.deviceCodeTtl ??= 600;
    this.devicePollInterval ??= 5;
    this.rememberConsent ??= true;
    this.rememberConsentTtl ??= 90 * 24 * 3600;
    this.registrationUnusedTtl ??= 86400;
    this.registrationIdleTtl ??= 7776000;
    this.registrationRateLimit ??= 20;
    this.registrationRateWindow ??= 3600;
    return this;
  }
}
