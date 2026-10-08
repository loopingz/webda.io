import { vi } from "vitest";
import type { DebugInfo, DebugLogEntry, DebugModel, DebugOperation, DebugRequest, DebugServiceInfo } from "../types.js";

/** A canned API: path → body or status. */
export type Routes = Record<string, unknown | { status: number; body?: unknown }>;

/** The token used by the fixtures. */
export const TOKEN = "fixture-token";

/** Fixture `/api/info`. */
export const INFO: DebugInfo = {
  package: { name: "sample-app", version: "1.2.3" },
  workingDirectory: "/Users/dev/sample-app",
  debugApiVersion: 1,
  debugVersion: "4.0.0-beta.6",
  frameworkVersion: "4.0.0-beta.6"
};

/** Fixture `/api/models`. */
export const MODELS: DebugModel[] = [
  {
    id: "Sample/User",
    plural: "Users",
    actions: ["follow"],
    relations: {
      queries: [{ attribute: "posts", model: "Sample/Post" }],
      binaries: [{ attribute: "avatar", cardinality: "ONE" }]
    },
    store: "Users",
    storeType: "MemoryStore",
    schemas: { Input: { type: "object" }, Output: { type: "object", properties: { uuid: { type: "string" } } } },
    metadata: { Ancestors: ["Webda/CoreModel"], Subclasses: ["Sample/Admin"] }
  },
  {
    id: "Sample/Admin",
    plural: "Admins",
    actions: [],
    relations: {},
    metadata: { Ancestors: ["Sample/User", "Webda/CoreModel"] }
  },
  {
    id: "Sample/Post",
    plural: "Posts",
    actions: [],
    relations: {
      parent: { attribute: "author", model: "Sample/User" },
      links: [{ attribute: "tags", model: "Sample/Tag" }]
    },
    metadata: { Ancestors: ["Webda/CoreModel"] }
  },
  { id: "Sample/Tag", plural: "Tags", actions: [], relations: {}, metadata: { Ancestors: ["Webda/CoreModel"] } },
  { id: "Webda/CoreModel", plural: "CoreModels", actions: [], relations: {}, metadata: {} }
];

/** Fixture `/api/services`. */
export const SERVICES: DebugServiceInfo[] = [
  {
    name: "Router",
    type: "Webda/Router",
    state: "running",
    capabilities: { router: true },
    configuration: { type: "Webda/Router", url: "/api", _internal: "hidden" },
    schema: {
      type: "object",
      properties: { url: { type: "string", description: "Base URL" }, retries: { type: "integer", default: 3 } }
    },
    metrics: [{ name: "requests", type: "counter", help: "Total requests", values: [{ value: 4 }, { value: 6 }] }]
  },
  { name: "Mailer", type: "Webda/Mailer", state: "stopped", capabilities: {}, configuration: {} }
];

/** Fixture `/api/operations`. */
export const OPERATIONS: DebugOperation[] = [
  {
    id: "User.Create",
    input: "Sample/User.input",
    output: "Sample/User.output",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, age: { type: "integer", minimum: 0, maximum: 10 } },
      required: ["name"]
    },
    outputSchema: { type: "object", properties: { uuid: { type: "string", format: "uuid" } } },
    rest: { method: "post", url: "/users" },
    summary: "Create a user",
    tags: ["users"],
    implementor: {
      type: "service",
      name: "DomainService",
      method: "create",
      code: "async function create() {\n  return 42; // ok\n}"
    }
  },
  { id: "User.Ping", input: "void", output: "void" }
];

/** Fixture `/api/requests`. */
export const REQUESTS: DebugRequest[] = [
  { id: "r1", method: "GET", url: "/users", timestamp: 1700000000000, statusCode: 200, duration: 12 },
  { id: "r2", method: "POST", url: "/users", timestamp: 1700000001000, statusCode: 404, duration: 3 }
];

/** Fixture `/api/requests/r1`. */
export const REQUEST_DETAIL: DebugRequest = {
  ...REQUESTS[0],
  requestHeaders: { accept: "application/json" },
  requestBody: { kind: "empty" },
  responseHeaders: { "content-type": "application/json" },
  responseBody: { kind: "text", content: '{"ok":true}', size: 11 }
};

/** Fixture `/api/logs`. */
export const LOGS: DebugLogEntry[] = [
  { id: "l1", timestamp: 1700000000000, level: "INFO", message: "Server started" },
  { id: "l2", timestamp: 1700000000500, level: "DEBUG", message: "Loading models" },
  { id: "l3", timestamp: 1700000001000, level: "ERROR", message: "Boom" }
];

/** Fixture `/api/config`. */
export const CONFIG = {
  parameters: { region: "eu-west-1", nested: { a: 1 } },
  services: { Router: { type: "Webda/Router" } }
};

/** Every route of a healthy server. */
export function healthyRoutes(): Routes {
  return {
    "/api/info": INFO,
    "/api/models": MODELS,
    "/api/services": SERVICES,
    "/api/operations": OPERATIONS,
    "/api/requests": REQUESTS,
    "/api/requests/r1": REQUEST_DETAIL,
    "/api/requests/r2": { status: 404, body: { error: "Request not found" } },
    "/api/logs": LOGS,
    "/api/config": CONFIG
  };
}

/** Options of {@link installFetch}. */
export interface FetchOptions {
  /** Expected token; requests without it get 401 */
  token?: string;
  /** Reject every request with a TypeError (network failure) */
  networkError?: boolean;
}

/**
 * Install a `fetch` mock serving canned routes with token checking.
 *
 * @param routes - the routes
 * @param options - token and failure mode
 * @returns the mock, to inspect the calls
 */
export function installFetch(routes: Routes, options: FetchOptions = {}): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (options.networkError) throw new TypeError("Failed to fetch");
    const headers = new Headers(init?.headers);
    if (options.token !== undefined && headers.get("authorization") !== `Bearer ${options.token}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }
    const route = routes[url.pathname];
    if (route === undefined) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }
    if (
      route &&
      typeof route === "object" &&
      "status" in (route as object) &&
      typeof (route as { status: unknown }).status === "number"
    ) {
      const r = route as { status: number; body?: unknown };
      return new Response(JSON.stringify(r.body ?? {}), {
        status: r.status,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify(route), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** Fake WebSocket recording instances and letting tests push frames. */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  url: string;
  protocols: string[];
  private listeners: Record<string, ((event: unknown) => void)[]> = {};

  /**
   * @param url - the url
   * @param protocols - the sub-protocols
   */
  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = typeof protocols === "string" ? [protocols] : (protocols ?? []);
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter(l => l !== listener);
  }

  /** Simulate the server accepting the connection. */
  open(): void {
    this.readyState = 1;
    for (const l of this.listeners.open ?? []) l({});
  }

  /**
   * Simulate a server frame.
   * @param data - the payload, serialized as JSON
   */
  emit(data: unknown): void {
    for (const l of this.listeners.message ?? []) l({ data: JSON.stringify(data) });
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    for (const l of this.listeners.close ?? []) l({});
  }

  /** Reset the recorded instances. */
  static reset(): void {
    FakeWebSocket.instances = [];
  }
}

/** Install the fake WebSocket on the global scope. */
export function installWebSocket(): void {
  FakeWebSocket.reset();
  vi.stubGlobal("WebSocket", FakeWebSocket);
}

/**
 * Wait for a condition.
 *
 * @param check - predicate
 * @param timeout - maximum wait in ms
 */
export async function waitUntil(check: () => boolean, timeout = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error("waitUntil timed out");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
