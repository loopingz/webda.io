import { useLog } from "@webda/workout";
import type { Readable } from "node:stream";
import { type AuthChallenge, parseAuthChallenge, type RegistryCredentials } from "./auth.js";
import { MANIFEST_ACCEPT, sha256 } from "./oci.js";
import { getRegistryApiHost } from "./reference.js";

/**
 * Options of a {@link RegistryClient}
 */
export interface RegistryClientOptions {
  /**
   * Credentials, anonymous when undefined
   */
  credentials?: RegistryCredentials;
  /**
   * Use plain http: default for `localhost` and `127.0.0.1`
   */
  insecure?: boolean;
  /**
   * fetch implementation, for tests
   */
  fetch?: typeof fetch;
}

/**
 * A manifest or index fetched from a registry
 */
export interface FetchedManifest {
  /**
   * Media type from the document or the response
   */
  mediaType: string;
  /**
   * Digest of the exact bytes
   */
  digest: string;
  /**
   * The exact bytes, needed to keep the digest
   */
  bytes: Buffer;
  /**
   * The parsed document
   */
  json: any;
}

/**
 * Error returned by a registry
 */
export class RegistryError extends Error {
  /**
   * @param message - the message
   * @param status - HTTP status
   */
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

/**
 * Client of the OCI distribution API (`/v2/`) for one registry
 *
 * Handles the registry token authentication: a request without token gets a 401 with a
 * `WWW-Authenticate` challenge, the client then asks the token service for the needed scopes
 * and retries. Tokens are cached per scope.
 */
export class RegistryClient {
  /**
   * Base URL of the API
   */
  readonly baseUrl: string;
  /**
   * Tokens per scope
   */
  protected tokens = new Map<string, string>();
  /**
   * Last challenge, to request tokens without a failing request first
   */
  protected challenge?: AuthChallenge;
  /**
   * fetch implementation
   */
  protected fetch: typeof fetch;

  /**
   * @param registry - registry from the image reference
   * @param options - the options
   */
  constructor(
    public readonly registry: string,
    protected options: RegistryClientOptions = {}
  ) {
    const host = getRegistryApiHost(registry);
    const insecure = options.insecure ?? /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
    this.baseUrl = `${insecure ? "http" : "https"}://${host}`;
    this.fetch = options.fetch ?? fetch;
  }

  /**
   * Get a bearer token for scopes from the challenge realm
   *
   * @param challenge - the bearer challenge
   * @param scopes - the scopes, `repository:<name>:pull,push`
   * @returns the token
   */
  protected async getToken(challenge: AuthChallenge, scopes: string[]): Promise<string> {
    const credentials = this.options.credentials;
    if (credentials?.token) {
      return credentials.token;
    }
    const { realm, service } = challenge.parameters;
    if (!realm) {
      throw new RegistryError(`Registry ${this.registry} sent a bearer challenge without realm`, 401);
    }
    const url = new URL(realm);
    let response: Response;
    if (credentials?.identityToken) {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: credentials.identityToken,
        client_id: "webda"
      });
      if (service) body.set("service", service);
      if (scopes.length) body.set("scope", scopes.join(" "));
      response = await this.fetch(url, {
        method: "POST",
        body,
        headers: { "content-type": "application/x-www-form-urlencoded" }
      });
    } else {
      if (service) url.searchParams.set("service", service);
      for (const scope of scopes) {
        url.searchParams.append("scope", scope);
      }
      const headers: Record<string, string> = {};
      if (credentials?.username) {
        headers.authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password ?? ""}`).toString("base64")}`;
      }
      response = await this.fetch(url, { headers });
    }
    if (!response.ok) {
      throw new RegistryError(
        `Cannot get a token from ${realm} for ${scopes.join(" ")}: ${response.status} ${await response.text()}`,
        response.status
      );
    }
    const json: any = await response.json();
    const token = json.token ?? json.access_token;
    if (!token) {
      throw new RegistryError(`Token service ${realm} returned no token`, 401);
    }
    return token;
  }

  /**
   * Authorization header for scopes, from the last challenge
   *
   * @param scopes - the scopes
   * @returns the header value, undefined before any challenge
   */
  protected async authorization(scopes: string[]): Promise<string | undefined> {
    const credentials = this.options.credentials;
    if (!this.challenge) {
      return credentials?.token ? `Bearer ${credentials.token}` : undefined;
    }
    if (this.challenge.scheme === "basic") {
      return credentials?.username
        ? `Basic ${Buffer.from(`${credentials.username}:${credentials.password ?? ""}`).toString("base64")}`
        : undefined;
    }
    const key = scopes.join(" ");
    if (!this.tokens.has(key)) {
      this.tokens.set(key, await this.getToken(this.challenge, scopes));
    }
    return `Bearer ${this.tokens.get(key)}`;
  }

  /**
   * Send an API request, authenticating on challenge
   *
   * @param method - HTTP method
   * @param path - path or absolute URL (upload locations)
   * @param scopes - scopes the request needs
   * @param init - additional request options
   * @param init.headers - request headers
   * @param init.body - factory of the body, called again when the request is replayed
   * @param init.redirect - redirect mode
   * @returns the response
   */
  async request(
    method: string,
    path: string,
    scopes: string[],
    init: { headers?: Record<string, string>; body?: () => any; redirect?: RequestRedirect } = {}
  ): Promise<Response> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { ...init.headers };
      const authorization = await this.authorization(scopes);
      if (authorization) {
        headers.authorization = authorization;
      }
      const body = init.body?.();
      const response = await this.fetch(url, {
        method,
        headers,
        body,
        redirect: init.redirect ?? "follow",
        ...(body && typeof body.pipe === "function" ? { duplex: "half" } : {})
      } as RequestInit);
      useLog("TRACE", `${method} ${url} ${response.status}`);
      if (response.status !== 401 || attempt > 0) {
        return response;
      }
      const challenge = parseAuthChallenge(response.headers.get("www-authenticate"));
      if (!challenge) {
        return response;
      }
      await response.arrayBuffer().catch(() => undefined);
      this.challenge = challenge;
      this.tokens.delete(scopes.join(" "));
    }
  }

  /**
   * Throw a {@link RegistryError} for an unexpected response
   *
   * @param response - the response
   * @param action - what was attempted
   */
  protected async fail(response: Response, action: string): Promise<never> {
    const text = await response.text().catch(() => "");
    throw new RegistryError(`${action} on ${this.registry} failed: ${response.status} ${text}`.trim(), response.status);
  }

  /**
   * Fetch a manifest or index
   *
   * @param repository - the repository
   * @param reference - tag or digest
   * @returns the manifest
   */
  async getManifest(repository: string, reference: string): Promise<FetchedManifest> {
    const response = await this.request(
      "GET",
      `/v2/${repository}/manifests/${reference}`,
      [`repository:${repository}:pull`],
      {
        headers: { accept: MANIFEST_ACCEPT }
      }
    );
    if (!response.ok) {
      await this.fail(response, `Get manifest ${repository}:${reference}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const json = JSON.parse(bytes.toString());
    const digest = sha256(bytes);
    if (reference.startsWith("sha256:") && reference !== digest) {
      throw new RegistryError(`Manifest ${repository}@${reference} has digest ${digest}`, 500);
    }
    return {
      mediaType: json.mediaType ?? response.headers.get("content-type")?.split(";")[0],
      digest,
      bytes,
      json
    };
  }

  /**
   * Fetch a blob
   *
   * @param repository - the repository
   * @param digest - the blob digest
   * @returns the response with the content as body
   */
  async getBlob(repository: string, digest: string): Promise<Response> {
    const response = await this.request("GET", `/v2/${repository}/blobs/${digest}`, [`repository:${repository}:pull`]);
    if (!response.ok) {
      await this.fail(response, `Get blob ${repository}@${digest}`);
    }
    return response;
  }

  /**
   * Check whether a blob exists in a repository
   *
   * @param repository - the repository
   * @param digest - the blob digest
   * @returns true if present
   */
  async hasBlob(repository: string, digest: string): Promise<boolean> {
    const response = await this.request("HEAD", `/v2/${repository}/blobs/${digest}`, [
      `repository:${repository}:pull,push`
    ]);
    return response.ok;
  }

  /**
   * Mount a blob from another repository of the same registry
   *
   * @param repository - the target repository
   * @param digest - the blob digest
   * @param from - the source repository
   * @returns true when mounted, false when the registry does not support it or the blob is missing
   */
  async mountBlob(repository: string, digest: string, from: string): Promise<boolean> {
    const response = await this.request(
      "POST",
      `/v2/${repository}/blobs/uploads/?mount=${encodeURIComponent(digest)}&from=${encodeURIComponent(from)}`,
      [`repository:${repository}:pull,push`, `repository:${from}:pull`]
    );
    await response.arrayBuffer().catch(() => undefined);
    if (response.status === 201) {
      return true;
    }
    if (response.status === 202) {
      // Not mounted: the registry opened an upload session that is abandoned
      return false;
    }
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return false;
    }
    return this.fail(response, `Mount blob ${digest} from ${from}`);
  }

  /**
   * Upload a blob in one request
   *
   * @param repository - the repository
   * @param digest - the blob digest
   * @param size - its size
   * @param body - factory of the content, called again if the request is replayed
   */
  async uploadBlob(repository: string, digest: string, size: number, body: () => Buffer | Readable): Promise<void> {
    const scopes = [`repository:${repository}:pull,push`];
    const start = await this.request("POST", `/v2/${repository}/blobs/uploads/`, scopes);
    await start.arrayBuffer().catch(() => undefined);
    if (start.status !== 202) {
      await this.fail(start, `Start upload of ${digest}`);
    }
    const location = new URL(start.headers.get("location"), `${this.baseUrl}/`);
    location.searchParams.set("digest", digest);
    const response = await this.request("PUT", location.toString(), scopes, {
      headers: { "content-type": "application/octet-stream", "content-length": `${size}` },
      body
    });
    await response.arrayBuffer().catch(() => undefined);
    if (response.status !== 201) {
      await this.fail(response, `Upload of ${digest}`);
    }
  }

  /**
   * Put a manifest or index
   *
   * @param repository - the repository
   * @param reference - tag or digest
   * @param bytes - the exact bytes
   * @param mediaType - its media type
   * @returns the digest returned by the registry
   */
  async putManifest(repository: string, reference: string, bytes: Buffer, mediaType: string): Promise<string> {
    const response = await this.request(
      "PUT",
      `/v2/${repository}/manifests/${reference}`,
      [`repository:${repository}:pull,push`],
      {
        headers: { "content-type": mediaType },
        body: () => bytes
      }
    );
    await response.arrayBuffer().catch(() => undefined);
    if (response.status !== 201) {
      await this.fail(response, `Put manifest ${repository}:${reference}`);
    }
    return response.headers.get("docker-content-digest") ?? sha256(bytes);
  }
}
