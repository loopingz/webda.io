import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Read a request body
 * @param request - the request
 * @returns the body
 */
async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * In-memory OCI registry for tests, with optional bearer token authentication
 */
export class FakeRegistry {
  server: Server;
  port: number;
  /**
   * Blobs per repository
   */
  blobs = new Map<string, Map<string, Buffer>>();
  /**
   * Manifests per repository, by tag and by digest
   */
  manifests = new Map<string, Map<string, { bytes: Buffer; mediaType: string }>>();
  uploads = new Map<string, string>();
  /**
   * Requests received, `METHOD path`
   */
  requests: string[] = [];
  /**
   * Scopes asked to the token service
   */
  scopes: string[] = [];

  /**
   * @param auth - require a bearer token obtained with these credentials
   * @param auth.username - user name expected by the token service
   * @param auth.password - password expected by the token service
   */
  constructor(public auth?: { username: string; password: string }) {}

  /**
   * Host of the registry
   * @returns `localhost:<port>`
   */
  get host(): string {
    return `localhost:${this.port}`;
  }

  /**
   * Start listening on a random port
   * @returns this
   */
  async start(): Promise<this> {
    this.server = createServer((request, response) => {
      this.handle(request, response).catch(err => {
        response.statusCode = 500;
        response.end(`${err}`);
      });
    });
    await new Promise<void>(resolve => this.server.listen(0, "127.0.0.1", resolve));
    this.port = (this.server.address() as AddressInfo).port;
    return this;
  }

  /**
   * Stop the server
   */
  async stop() {
    await new Promise(resolve => this.server.close(resolve));
  }

  /**
   * Store a blob directly
   * @param repository - the repository
   * @param data - the content
   * @returns the digest
   */
  addBlob(repository: string, data: Buffer): string {
    const digest = `sha256:${createHash("sha256").update(data).digest("hex")}`;
    if (!this.blobs.has(repository)) this.blobs.set(repository, new Map());
    this.blobs.get(repository).set(digest, data);
    return digest;
  }

  /**
   * Store a manifest directly
   * @param repository - the repository
   * @param reference - the tag
   * @param document - the manifest
   * @param raw - the exact bytes, serialized from the document when undefined
   * @returns the digest
   */
  addManifest(repository: string, reference: string, document: any, raw?: Buffer): string {
    const bytes = raw ?? Buffer.from(JSON.stringify(document));
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (!this.manifests.has(repository)) this.manifests.set(repository, new Map());
    const entry = { bytes, mediaType: document.mediaType };
    this.manifests.get(repository).set(reference, entry);
    this.manifests.get(repository).set(digest, entry);
    return digest;
  }

  /**
   * Handle a request
   * @param request - the request
   * @param response - the response
   */
  async handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url, `http://${this.host}`);
    this.requests.push(`${request.method} ${url.pathname}${url.search}`);
    if (url.pathname === "/token") {
      this.scopes.push(...url.searchParams.getAll("scope"));
      const expected = `Basic ${Buffer.from(`${this.auth.username}:${this.auth.password}`).toString("base64")}`;
      if (request.headers.authorization !== expected) {
        response.statusCode = 401;
        response.end();
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ token: "good" }));
      return;
    }
    if (this.auth && request.headers.authorization !== "Bearer good") {
      response.statusCode = 401;
      response.setHeader("www-authenticate", `Bearer realm="http://${this.host}/token",service="fake"`);
      response.end();
      return;
    }
    let match = /^\/v2\/(.+)\/blobs\/uploads\/(.*)$/.exec(url.pathname);
    if (match) {
      const [, repository, id] = match;
      if (request.method === "POST") {
        await readBody(request);
        const mount = url.searchParams.get("mount");
        if (mount && this.blobs.get(url.searchParams.get("from"))?.has(mount)) {
          this.addBlob(repository, this.blobs.get(url.searchParams.get("from")).get(mount));
          response.statusCode = 201;
          response.end();
          return;
        }
        const upload = randomUUID();
        this.uploads.set(upload, repository);
        response.statusCode = 202;
        response.setHeader("location", `/v2/${repository}/blobs/uploads/${upload}?state=x`);
        response.end();
        return;
      }
      if (request.method === "PUT" && this.uploads.get(id) === repository) {
        const body = await readBody(request);
        const digest = this.addBlob(repository, body);
        response.statusCode = digest === url.searchParams.get("digest") ? 201 : 400;
        response.end();
        return;
      }
    }
    match = /^\/v2\/(.+)\/(blobs|manifests)\/([^/]+)$/.exec(url.pathname);
    if (match) {
      const [, repository, kind, reference] = match;
      if (kind === "blobs") {
        const blob = this.blobs.get(repository)?.get(reference);
        response.statusCode = blob ? 200 : 404;
        response.end(request.method === "HEAD" ? undefined : blob);
        return;
      }
      if (request.method === "PUT") {
        const bytes = await readBody(request);
        const digest = this.addManifest(repository, reference, JSON.parse(bytes.toString()), bytes);
        response.statusCode = 201;
        response.setHeader("docker-content-digest", digest);
        response.end();
        return;
      }
      const manifest = this.manifests.get(repository)?.get(reference);
      if (!manifest) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader("content-type", manifest.mediaType);
      response.end(manifest.bytes);
      return;
    }
    response.statusCode = 404;
    response.end();
  }
}
