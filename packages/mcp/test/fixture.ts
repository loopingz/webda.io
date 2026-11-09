import {
  Service,
  ServiceParameters,
  Session,
  WebContext,
  WebdaError,
  registerOperation,
  registerSchema,
  useApplication,
  useContext,
  useService
} from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { request as httpRequest } from "node:http";
import { Duplex } from "node:stream";
import type { McpAuthenticator } from "../src/auth.js";

/**
 * Create an in-memory Duplex socket pair connected to an HTTP server
 * @param server - node HTTP server instance
 * @returns createConnection callback for http.request
 */
export function createInProcessConnection(server: any) {
  return () => {
    const clientSock: any = new Duplex({
      /** No-op read */
      read() {},
      /**
       * Forward chunk to server
       * @param chunk - data chunk
       * @param _enc - encoding
       * @param cb - callback
       */
      write(chunk, _enc, cb) {
        cb();
        setImmediate(() => {
          if (!serverSock.destroyed) {
            if (serverSock.isPaused()) serverSock.resume();
            serverSock.push(chunk);
          }
        });
      },
      /**
       * Forward EOF to server
       * @param cb - callback
       */
      final(cb) {
        cb();
        setImmediate(() => {
          if (!serverSock.destroyed) serverSock.push(null);
        });
      }
    });
    const serverSock: any = new Duplex({
      /** No-op read */
      read() {},
      /**
       * Forward chunk to client
       * @param chunk - data chunk
       * @param _enc - encoding
       * @param cb - callback
       */
      write(chunk, _enc, cb) {
        cb();
        setImmediate(() => {
          if (!clientSock.destroyed) {
            if (clientSock.isPaused()) clientSock.resume();
            clientSock.push(chunk);
          }
        });
      },
      /**
       * Forward EOF to client
       * @param cb - callback
       */
      final(cb) {
        cb();
        setImmediate(() => {
          if (!clientSock.destroyed) clientSock.push(null);
        });
      }
    });
    for (const s of [clientSock, serverSock]) {
      s.setTimeout = () => s;
      s.setNoDelay = () => s;
      s.setKeepAlive = () => s;
      s.address = () => server.address?.() ?? { port: 0 };
      s.remoteAddress = "127.0.0.1";
    }
    clientSock.on("close", () => serverSock.destroy());
    serverSock.on("close", () => clientSock.destroy());
    server.emit("connection", serverSock);
    queueMicrotask(() => clientSock.emit("connect"));
    return clientSock;
  };
}

/**
 * Gate used by Fixture.Gate to prove SSE chunks are delivered incrementally
 */
export const fixtureGate = {
  release: undefined as undefined | (() => void),
  /**
   * Let a pending Fixture.Gate call continue
   */
  open() {
    this.release?.();
  }
};

/** Sentinel model "class" used by the Thing resource operations */
export const ThingModel = { name: "Thing" };
/** Sentinel model "class" for a second resource model */
export const GadgetModel = { name: "Gadget" };
/** Sentinel model "class" for a resource model with large multibyte records */
export const WideModel = { name: "Wide" };
/** Sentinel model "class" for a resource model whose Query fails */
export const BrokenModel = { name: "Broken" };

const THINGS: Record<string, { slug: string; label: string }> = {
  alpha: { slug: "alpha", label: "First" },
  "a/b c": { slug: "a/b c", label: "Encoded" },
  beta: { slug: "beta", label: "Second" }
};

/**
 * Service providing every operation shape the MCP transport must handle
 */
export class McpFixtureService extends Service {
  /**
   * Load parameters
   * @param params - raw parameters
   * @returns parameters
   */
  loadParameters(params: any): ServiceParameters {
    return new ServiceParameters().load(params);
  }

  /**
   * Return the text
   * @param text - text to echo
   * @returns the text
   */
  echo(text: string) {
    return { text };
  }

  /**
   * Return a scalar
   * @returns a scalar
   */
  version() {
    return "1.2.3";
  }

  /**
   * Return nothing
   * @returns nothing
   */
  noop() {}

  /**
   * Return a secret, only for alice
   * @returns a secret, only for alice
   */
  secret() {
    return { secret: 42 };
  }

  /**
   * Count operation
   * @param n - number of chunks
   * @yields one chunk per step with the total
   */
  async *count(n: number) {
    for (let i = 1; i <= n; i++) {
      yield { index: i, total: n };
    }
  }

  /**
   * Return an object carrying server-only fields
   * @returns an object carrying server-only fields
   */
  priv() {
    return { a: 1, __x: "s", n: { __h: "h", ok: 2 } };
  }

  /**
   * Perform priv stream
   * @yields chunks carrying server-only fields
   */
  async *privStream() {
    yield { a: 1, __x: "s", n: { __h: "h", ok: 2 } };
  }

  /**
   * Yields once, waits for the test to open the gate, then yields again
   * @yields two steps
   */
  async *gate() {
    yield { step: 1 };
    await new Promise<void>(resolve => (fixtureGate.release = resolve));
    yield { step: 2 };
  }

  /**
   * Fail operation
   * @param kind - "client" throws a 400, anything else a plain Error
   */
  fail(kind: string) {
    if (kind === "client") {
      throw new WebdaError.BadRequest("Kind is not supported");
    }
    throw new Error("database password leaked in message");
  }

  /**
   * Return what the operation sees of the HTTP request carrying the call
   * @returns what the operation sees of the HTTP request carrying the call
   */
  headers() {
    const http = useContext<WebContext>().getHttpContext?.();
    return {
      http: http !== undefined,
      key: http?.getUniqueHeader("x-example-key") ?? null,
      other: http?.getUniqueHeader("x-other") ?? null,
      authorization: http?.getUniqueHeader("authorization") ?? null,
      cookie: http?.getUniqueHeader("cookie") ?? null,
      user: http?.getUniqueHeader("x-test-user") ?? null,
      path: http?.getRelativeUri() ?? null
    };
  }

  /**
   * Return a large payload
   * @returns a large payload
   */
  big() {
    return { data: "x".repeat(2048) };
  }

  /**
   * Returns an object that does not match its declared output schema,
   * like a serialized model (missing required fields, extra fields)
   * @returns a loose object
   */
  loose() {
    return { other: 1 };
  }

  /**
   * Return a record whose JSON is mostly two-byte characters
   * @param slug - key
   * @returns a record whose JSON is mostly two-byte characters
   */
  wide(slug: string) {
    return { slug, label: "\u00e9".repeat(1000) };
  }

  /**
   * Get the thing
   * @param slug - thing key
   * @returns the thing
   */
  getThing(slug: string) {
    if (!THINGS[slug]) {
      throw new WebdaError.NotFound("Thing not found");
    }
    return THINGS[slug];
  }

  /**
   * Return never, throws a plain error
   * @returns never, throws a plain error
   */
  brokenQuery(): never {
    throw new Error("db password");
  }

  /**
   * Pages of one item; the continuation token is the next index
   * @param query - WebdaQL with `LIMIT n` and optional `OFFSET "token"`
   * @returns a query result
   */
  queryThings(query: string) {
    const offset = Number(/OFFSET "(\d+)"/.exec(query || "")?.[1] ?? 0);
    const keys = Object.keys(THINGS);
    return {
      results: [THINGS[keys[offset]]].filter(Boolean),
      continuationToken: offset + 1 < keys.length ? String(offset + 1) : undefined
    };
  }
}

/**
 * Test authenticator: logs in the user named by the `x-test-user` header
 */
export class HeaderAuthenticator extends Service implements McpAuthenticator {
  /**
   * Load parameters
   * @param params - raw parameters
   * @returns parameters
   */
  loadParameters(params: any): ServiceParameters {
    return new ServiceParameters().load(params);
  }

  /**
   * Authenticate operation
   * @param ctx - request context
   * @returns a session for the header user, anonymous otherwise
   */
  async authenticate(ctx: WebContext): Promise<Session> {
    const session = new Session();
    const user = ctx.getHttpContext().getUniqueHeader("x-test-user");
    if (user === "reject") {
      throw new WebdaError.Unauthorized("Rejected");
    }
    if (user) {
      session.login(user, user);
    }
    return session;
  }
}

/**
 * Register a schema in both the AJV registry and the application map
 * @param name - schema name
 * @param schema - JSON schema
 */
function schema(name: string, schema: any) {
  useApplication().getSchemas()[name] = schema;
  try {
    registerSchema(name, schema);
  } catch {
    // already registered by a previous test
  }
}

/**
 * Register the fixture schemas and operations (idempotent)
 */
export function registerFixture(): void {
  schema("Fixture.Echo", { type: "object", properties: { text: { type: "string" } }, required: ["text"] });
  schema("Fixture.Echo.output", { type: "object", properties: { text: { type: "string" } }, required: ["text"] });
  schema("Fixture.Count", { type: "object", properties: { n: { type: "number" } }, required: ["n"] });
  schema("Fixture.Fail", { type: "object", properties: { kind: { type: "string" } }, required: ["kind"] });
  schema("Thing.primaryKey", { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] });
  schema("searchRequest", { type: "object", properties: { query: { type: "string" } } });
  const op = (id: string, method: string, extra: any = {}) =>
    registerOperation(id, { service: "Fixture", method, input: "void", output: "void", ...extra });
  op("Fixture.Echo", "echo", { input: "Fixture.Echo", output: "Fixture.Echo.output", summary: "Echo text" });
  op("Fixture.Version", "version");
  op("Fixture.Noop", "noop", { output: "Fixture.Echo.output" });
  op("Fixture.Secret", "secret", { permission: "userId = 'alice'" });
  op("Fixture.Count", "count", { input: "Fixture.Count" });
  op("Fixture.Gate", "gate");
  op("Fixture.Private", "priv");
  op("Fixture.PrivateStream", "privStream");
  op("Fixture.Fail", "fail", { input: "Fixture.Fail" });
  op("Fixture.Big", "big");
  op("Fixture.Loose", "loose", { output: "Fixture.Echo.output" });
  op("Fixture.Hidden", "version", { hidden: true });
  op("Fixture.NoMcp", "version", { mcp: false });
  op("Thing.Get", "getThing", { input: "Thing.primaryKey", context: { model: ThingModel, pkFields: ["slug"] } });
  op("Things.Query", "queryThings", { input: "searchRequest", context: { model: ThingModel } });
}

/**
 * Services every fixture test configures
 */
export const FIXTURE_SERVICES = {
  Fixture: { type: "Webda/McpFixtureService" }
};

/**
 * Base class: a real Webda application with the fixture service
 */
export class McpFixtureTest extends WebdaApplicationTest {
  /** Saved global fetch */
  private originalFetch?: typeof globalThis.fetch;

  /**
   * Get the configuration
   * @returns the configuration
   */
  getTestConfiguration(): any {
    return { services: { ...FIXTURE_SERVICES } };
  }

  /**
   * Perform tweak app
   * @param app - test application
   */
  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/McpFixtureService", McpFixtureService);
    app.addModda("Webda/HeaderAuthenticator", HeaderAuthenticator);
  }

  /** @override */
  async beforeAll(init: boolean = true): Promise<void> {
    await super.beforeAll(init);
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, initReq?: RequestInit) => {
      let http: any;
      try {
        http = useService("HttpServer" as any);
      } catch {
        // no HttpServer in this suite
      }
      if (!http?.server) {
        return this.originalFetch!(input, initReq);
      }
      const parsed = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
      const reqHeaders: Record<string, string> = { host: parsed.host };
      new Headers(initReq?.headers).forEach((v, k) => {
        reqHeaders[k] = v;
      });
      return new Promise<Response>((resolve, reject) => {
        const req = httpRequest(
          {
            method: initReq?.method ?? "GET",
            path: parsed.pathname + parsed.search,
            headers: reqHeaders,
            createConnection: createInProcessConnection(http.server) as any
          },
          res => {
            const body =
              res.statusCode === 204 || res.statusCode === 304 || (initReq?.method ?? "GET").toUpperCase() === "HEAD"
                ? null
                : new ReadableStream({
                    /**
                     * Start stream
                     * @param controller - stream controller
                     */
                    start(controller) {
                      res.on("data", chunk => {
                        try {
                          controller.enqueue(new Uint8Array(chunk));
                        } catch {}
                      });
                      res.on("end", () => {
                        try {
                          controller.close();
                        } catch {}
                      });
                      res.on("close", () => {
                        if (!res.complete) {
                          try {
                            controller.error(new DOMException("The operation was aborted.", "AbortError"));
                          } catch {}
                        }
                      });
                      res.on("error", err => {
                        try {
                          controller.error(err);
                        } catch {}
                      });
                    },
                    /** Cancel stream */
                    cancel() {
                      req.destroy();
                    }
                  });
            const respHeaders = new Headers();
            for (const [k, v] of Object.entries(res.headers)) {
              if (Array.isArray(v)) {
                for (const item of v) respHeaders.append(k, item);
              } else if (v !== undefined) {
                respHeaders.set(k, v);
              }
            }
            resolve(
              new Response(body, {
                status: res.statusCode ?? 200,
                statusText: res.statusMessage,
                headers: respHeaders
              })
            );
          }
        );
        req.on("error", reject);
        if (initReq?.signal) {
          if (initReq.signal.aborted) {
            req.destroy();
            reject(new DOMException("The operation was aborted.", "AbortError"));
            return;
          }
          initReq.signal.addEventListener(
            "abort",
            () => {
              req.destroy();
              reject(new DOMException("The operation was aborted.", "AbortError"));
            },
            { once: true }
          );
        }
        if (initReq?.body !== undefined && initReq?.body !== null) {
          req.end(
            typeof initReq.body === "string" || Buffer.isBuffer(initReq.body) ? initReq.body : String(initReq.body)
          );
        } else {
          req.end();
        }
      });
    }) as typeof globalThis.fetch;
  }

  /** @override */
  async afterAll(): Promise<void> {
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
    }
    await super.afterAll();
  }
}
