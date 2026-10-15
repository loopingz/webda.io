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
  /** Device authorization grant allowed */
  deviceFlow?: boolean;
  /** Loaded from a Client ID Metadata Document */
  metadataDocument?: boolean;
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
}

/** OAuthServer parameters */
export class OAuthServerParameters extends ServiceParameters {
  /** @default "/oauth" */
  url: string;
  /** Issuer; defaults to the request origin */
  issuer?: string;
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
    this.clientMetadataDocuments ??= true;
    this.clientMetadataHosts ??= [];
    this.clientMetadataTimeout ??= 5;
    this.clientMetadataCacheTtl ??= 3600;
    this.codeTtl ??= 60;
    this.deviceCodeTtl ??= 600;
    this.devicePollInterval ??= 5;
    this.rememberConsent ??= true;
    this.rememberConsentTtl ??= 90 * 24 * 3600;
    return this;
  }
}
