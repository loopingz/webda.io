/**
 * Test helpers of the client runtime: a small manifest and a fake fetch answering from an in-memory store
 */
import type { ModelsManifest, OperationsManifest } from "./types.js";

export const OPERATIONS: OperationsManifest = {
  "Task.Get": {
    id: "Task.Get",
    input: "App/Task.primaryKey",
    output: "App/Task",
    streaming: "none",
    model: "App/Task",
    kind: "get",
    rest: { method: "get", path: "/tasks/{uuid}", pathParams: ["uuid"] }
  },
  "Tasks.Query": {
    id: "Tasks.Query",
    input: "searchRequest",
    output: "App/Task.queryResult",
    streaming: "none",
    model: "App/Task",
    kind: "query",
    rest: { method: "get", path: "/tasks", pathParams: [], query: ["q"] }
  },
  "Task.Create": {
    id: "Task.Create",
    input: "App/Task?",
    output: "App/Task",
    streaming: "none",
    model: "App/Task",
    kind: "create",
    rest: { method: "post", path: "/tasks", pathParams: [] }
  },
  "Task.Update": {
    id: "Task.Update",
    input: "App/Task?",
    output: "App/Task",
    streaming: "none",
    model: "App/Task",
    kind: "update",
    rest: { method: "put", path: "/tasks/{uuid}", pathParams: ["uuid"] }
  },
  "Task.Patch": {
    id: "Task.Patch",
    input: "App/Task?",
    output: "App/Task",
    streaming: "none",
    model: "App/Task",
    kind: "patch",
    rest: { method: "patch", path: "/tasks/{uuid}", pathParams: ["uuid"] }
  },
  "Task.Delete": {
    id: "Task.Delete",
    input: "App/Task.primaryKey",
    output: "void",
    streaming: "none",
    model: "App/Task",
    kind: "delete",
    rest: { method: "delete", path: "/tasks/{uuid}", pathParams: ["uuid"] }
  },
  "Task.Archive": {
    id: "Task.Archive",
    input: "uuidRequest",
    output: "App/Task.archive.output",
    streaming: "none",
    model: "App/Task",
    kind: "action",
    action: { name: "archive" },
    rest: { method: "put", path: "/tasks/{uuid}/archive", pathParams: ["uuid"] }
  },
  "Task.Count": {
    id: "Task.Count",
    input: "void",
    output: "App/Task.count.output",
    streaming: "none",
    model: "App/Task",
    kind: "action",
    action: { name: "count", global: true },
    rest: { method: "put", path: "/tasks/count", pathParams: [] }
  },
  "User.Get": {
    id: "User.Get",
    input: "App/User.primaryKey",
    output: "App/User",
    streaming: "none",
    model: "App/User",
    kind: "get",
    rest: { method: "get", path: "/users/{uuid}", pathParams: ["uuid"] }
  },
  "Users.Query": {
    id: "Users.Query",
    input: "searchRequest",
    output: "App/User.queryResult",
    streaming: "none",
    model: "App/User",
    kind: "query",
    rest: { method: "put", path: "/users", pathParams: [] }
  },
  "Comment.Get": {
    id: "Comment.Get",
    input: "App/Comment.primaryKey",
    output: "App/Comment",
    streaming: "none",
    model: "App/Comment",
    kind: "get",
    rest: { method: "get", path: "/tasks/{pid.0}/comments/{uuid}", pathParams: ["pid.0", "uuid"] }
  },
  "Comment.Create": {
    id: "Comment.Create",
    input: "App/Comment?",
    output: "App/Comment",
    streaming: "none",
    model: "App/Comment",
    kind: "create",
    rest: { method: "post", path: "/tasks/{pid.0}/comments", pathParams: ["pid.0"] }
  },
  "Tag.Get": {
    id: "Tag.Get",
    input: "App/Tag.primaryKey",
    output: "App/Tag",
    streaming: "none",
    model: "App/Tag",
    kind: "get",
    rest: { method: "get", path: "/tags/{org}/{slug}", pathParams: ["org", "slug"] }
  },
  "Audit.Tail": {
    id: "Audit.Tail",
    input: "Audit.Since",
    output: "void",
    streaming: "server",
    kind: "service",
    rest: { method: "put", path: "/audit/tail", pathParams: [] }
  },
  "Audit.Upload": {
    id: "Audit.Upload",
    input: "void",
    output: "void",
    streaming: "client",
    kind: "service",
    rest: { method: "put", path: "/audit/upload", pathParams: [] }
  },
  "Audit.Chat": {
    id: "Audit.Chat",
    input: "void",
    output: "void",
    streaming: "bidi",
    kind: "service",
    rest: { method: "put", path: "/audit/chat", pathParams: [] }
  },
  "Auth.Me": {
    id: "Auth.Me",
    input: "void",
    output: "App/User",
    streaming: "none",
    kind: "service",
    tags: ["App/User"],
    rest: { method: "get", path: "/auth/me", pathParams: [] }
  },
  "Hidden.Op": {
    id: "Hidden.Op",
    input: "void",
    output: "void",
    streaming: "none",
    kind: "service"
  }
};

export const MODELS: ModelsManifest = {
  "App/Task": {
    id: "App/Task",
    shortName: "Task",
    plural: "Tasks",
    primaryKey: ["uuid"],
    ancestors: ["App/Item"],
    links: [{ attribute: "owner", model: "App/User", type: "LINK" }],
    queries: [{ attribute: "comments", model: "App/Comment", targetAttribute: "task" }],
    dates: ["due"],
    operations: {
      get: "Task.Get",
      query: "Tasks.Query",
      create: "Task.Create",
      update: "Task.Update",
      patch: "Task.Patch",
      delete: "Task.Delete",
      actions: { archive: "Task.Archive", count: "Task.Count" },
      behaviors: {}
    }
  },
  "App/Item": {
    id: "App/Item",
    shortName: "Item",
    plural: "Items",
    primaryKey: ["uuid"],
    ancestors: [],
    links: [],
    queries: [],
    dates: [],
    operations: { actions: {}, behaviors: {} }
  },
  "App/User": {
    id: "App/User",
    shortName: "User",
    plural: "Users",
    primaryKey: ["uuid"],
    ancestors: [],
    links: [
      { attribute: "friends", model: "App/User", type: "LINKS_SIMPLE_ARRAY" },
      { attribute: "roles", model: "App/User", type: "LINKS_ARRAY" },
      { attribute: "contacts", model: "App/User", type: "LINKS_MAP" }
    ],
    queries: [{ attribute: "tasks", model: "App/Task", targetAttribute: "owner" }],
    dates: [],
    operations: { get: "User.Get", query: "Users.Query", actions: {}, behaviors: {} }
  },
  "App/Comment": {
    id: "App/Comment",
    shortName: "Comment",
    plural: "Comments",
    primaryKey: ["uuid"],
    ancestors: [],
    parent: { attribute: "task", model: "App/Task" },
    links: [],
    queries: [],
    dates: [],
    operations: { get: "Comment.Get", create: "Comment.Create", actions: {}, behaviors: {} }
  },
  "App/Tag": {
    id: "App/Tag",
    shortName: "Tag",
    plural: "Tags",
    primaryKey: ["org", "slug"],
    primaryKeySeparator: "/",
    ancestors: [],
    links: [],
    queries: [],
    dates: [],
    operations: { get: "Tag.Get", actions: {}, behaviors: {} }
  }
};

/** A recorded request */
export interface Recorded {
  method: string;
  url: string;
  body?: any;
  headers: Record<string, string>;
}

/**
 * A fake server: records the requests and answers with handlers by `METHOD path`
 */
export class FakeServer {
  requests: Recorded[] = [];
  handlers: Array<{ method: string; pattern: RegExp; handler: (match: RegExpExecArray, req: Recorded) => any }> = [];

  /**
   * @param method - HTTP method
   * @param pattern - path pattern, with `:name` parameters
   * @param handler - returns the body (a Response for full control)
   * @returns this
   */
  on(method: string, pattern: string, handler: (match: RegExpExecArray, req: Recorded) => any): this {
    const source = "^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:(\w+)/g, "([^/]+)") + "$";
    this.handlers.push({ method: method.toUpperCase(), pattern: new RegExp(source), handler });
    return this;
  }

  /**
   * A fetch implementation over the handlers
   * @returns the fetch
   */
  fetch(): typeof fetch {
    return (async (input: any, init: any = {}) => {
      const url = new URL(String(input));
      const req: Recorded = {
        method: init.method ?? "GET",
        url: url.toString(),
        headers: init.headers ?? {},
        body: init.body ? JSON.parse(init.body) : undefined
      };
      this.requests.push(req);
      for (const { method, pattern, handler } of this.handlers) {
        const match = pattern.exec(url.pathname);
        if (method === req.method && match) {
          const result = await handler(match, req);
          if (result instanceof Response) return result;
          if (result === undefined) return new Response(null, { status: 204 });
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
      }
      return new Response(JSON.stringify({ error: { message: "Not found", code: 404 } }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;
  }
}

/**
 * @param text - body
 * @param size - chunk size in bytes
 * @returns a stream of it, split in small chunks
 */
export function chunked(text: string, size: number = 7): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    }
  });
}
