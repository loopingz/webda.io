import { iamGlobMatch } from "@webda/utils";
import { isAcceptableRedirect } from "./clients.js";
import { OAuthError } from "./errors.js";

/** Maximum number of redirect URIs of a registration, as for a metadata document */
const MAX_REDIRECT_URIS = 20;
/** Longest accepted `client_name` */
const MAX_CLIENT_NAME = 100;
/** Hosts of the loopback redirects */
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "[::1]"];
/** Grant types a registered client may use */
const GRANT_TYPES = ["authorization_code", "refresh_token"];

/**
 * Client metadata accepted by the registration endpoint (RFC 7591 §2): public clients only
 */
export interface RegistrationRequest {
  redirect_uris: string[];
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  scope?: string;
}

/**
 * @param code - OAuth error code
 * @param description - description
 * @returns the 400 error
 */
function invalid(code: "invalid_redirect_uri" | "invalid_client_metadata", description: string): OAuthError {
  return new OAuthError(code, description);
}

/**
 * @param value - untrusted value
 * @param name - field name
 * @returns the value when it is an https URL
 * @throws OAuthError invalid_client_metadata otherwise
 */
function httpsUrl(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  try {
    if (typeof value === "string" && value.length <= 2048 && new URL(value).protocol === "https:") return value;
  } catch {
    // Reported below
  }
  throw invalid("invalid_client_metadata", `${name} must be an https URL`);
}

/**
 * @param value - untrusted value
 * @param allowed - accepted values
 * @param name - field name
 * @throws OAuthError invalid_client_metadata unless the value is absent or an array of accepted values
 */
function checkList(value: unknown, allowed: string[], name: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some(v => !allowed.includes(v))) {
    throw invalid("invalid_client_metadata", `Unsupported ${name}`);
  }
}

/**
 * Validate a registration request
 * @param body - parsed JSON body
 * @param patterns - globs every redirect URI must match one of
 * @returns the accepted metadata
 * @throws OAuthError invalid_redirect_uri or invalid_client_metadata
 */
export function parseRegistration(body: unknown, patterns?: string[]): RegistrationRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalid("invalid_client_metadata", "Body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || !uris.length) throw invalid("invalid_redirect_uri", "redirect_uris is required");
  if (uris.length > MAX_REDIRECT_URIS) throw invalid("invalid_redirect_uri", "Too many redirect_uris");
  for (const uri of uris) {
    if (!isAcceptableRedirect(uri)) throw invalid("invalid_redirect_uri", "Unacceptable redirect URI");
    // The browser follows the parsed URL: only a canonical string is stored, and patterns match its parsed form
    const url = new URL(uri);
    if (url.href !== uri) throw invalid("invalid_redirect_uri", "Redirect URI must be in canonical form");
    // Loopback redirects are allowed on any port (RFC 8252 §7.3): the port is not matched
    const host = LOOPBACK_HOSTS.includes(url.hostname) ? url.hostname : url.host;
    const target = host ? `${url.protocol}//${host}${url.pathname}` : url.href;
    if (patterns && !patterns.some(p => iamGlobMatch(target, p))) {
      throw invalid("invalid_redirect_uri", "Redirect URI not allowed");
    }
  }
  if (b.token_endpoint_auth_method !== undefined && b.token_endpoint_auth_method !== "none") {
    throw invalid("invalid_client_metadata", "Only public clients are supported");
  }
  checkList(b.grant_types, GRANT_TYPES, "grant_types");
  if (b.response_types !== undefined) {
    if (!Array.isArray(b.response_types) || b.response_types.length !== 1 || b.response_types[0] !== "code") {
      throw invalid("invalid_client_metadata", "Unsupported response_types");
    }
  }
  const request: RegistrationRequest = { redirect_uris: uris as string[] };
  if (b.client_name !== undefined) {
    if (typeof b.client_name !== "string" || b.client_name.length > MAX_CLIENT_NAME) {
      throw invalid("invalid_client_metadata", "Invalid client_name");
    }
    request.client_name = b.client_name;
  }
  request.client_uri = httpsUrl(b.client_uri, "client_uri");
  request.logo_uri = httpsUrl(b.logo_uri, "logo_uri");
  if (b.scope !== undefined) {
    if (typeof b.scope !== "string") throw invalid("invalid_client_metadata", "Invalid scope");
    request.scope = b.scope;
  }
  return request;
}
