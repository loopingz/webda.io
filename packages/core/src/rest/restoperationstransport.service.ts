import { bind, QueryValidator } from "@webda/ql";
import { TransformCase, TransformCaseType } from "@webda/utils";
import { OperationsTransport, OperationsTransportParameters } from "../services/operationstransport.js";
import { OperationDefinition } from "../core/icore.js";
import { OpenAPIWebdaDefinition } from "./irest.js";
import * as WebdaError from "../errors/errors.js";
import { useRouter } from "./hooks.js";
import { useLog } from "@webda/workout";
import { HttpContext, type HttpMethodType } from "../contexts/httpcontext.js";
import { runWithContext } from "../contexts/execution.js";
import { emitCoreEvent, useCoreEvents } from "../events/events.js";
import { useApplication, useParameters } from "../application/hooks.js";
import { useCore, useModelMetadata } from "../core/hooks.js";
import { runWithInstanceStorage, useInstanceStorage } from "../core/instancestorage.js";
import { callOperation, canCallOperation, getOperationStreaming } from "../core/operations.js";
import { AsyncQueue } from "../core/asyncqueue.js";
import { WebContext } from "../contexts/webcontext.js";
import { WebSocketOperationContext } from "../contexts/websocketcontext.js";
import { RestStreamingOperationContext, type RestStreamFormat } from "../contexts/restcontext.js";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { hasSchema } from "../schemas/hooks.js";
import type { ModelClass } from "@webda/models";
import type { ModelAction } from "../models/types.js";
import type { ModelGraphBehaviorDefinition, ModelMetadata } from "@webda/compiler";

/**
 * @param data - a raw WebSocket message
 * @returns its length in bytes
 */
function rawLength(data: Buffer | ArrayBuffer | Buffer[]): number {
  if (Array.isArray(data)) return data.reduce((sum, chunk) => sum + chunk.length, 0);
  return data instanceof ArrayBuffer ? data.byteLength : data.length;
}

/**
 * Swagger static html
 */
const SWAGGER_HTML = `
<html>
  <head>
    <meta charset="UTF-8">
    <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/{{VERSION}}/swagger-ui.css" >
    <style>
      .topbar {
        display: none;
      }
    </style>
  </head>

  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/{{VERSION}}/swagger-ui-bundle.js"> </script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/{{VERSION}}/swagger-ui-standalone-preset.js"> </script>
    <script>
      const spec = {{OPENAPI}};
      window.onload = function() {
        const ui = SwaggerUIBundle({
          spec: spec,
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          plugins: [
            SwaggerUIBundle.plugins.DownloadUrl
          ],
          layout: "StandaloneLayout"
        })

        window.ui = ui
      }
  </script>
  </body>
</html>
`;

/**
 * Parameters for RESTOperationsTransport
 */
export class RESTOperationsTransportParameters extends OperationsTransportParameters {
  /**
   * Expose the OpenAPI
   *
   * @default true if debug false otherwise
   */
  exposeOpenAPI?: boolean;
  /**
   * Swagger version to use
   *
   * https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui.css
   * https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui-bundle.js
   * https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui-standalone-preset.js
   *
   * TODO Add renovatebot regex
   */
  swaggerVersion: string = "5.31.0";
  /**
   * Base URL for the REST API
   */
  url: string = "/";
  /**
   * Transform the name of the model to be used in the URL
   *
   * @see https://blog.boot.dev/clean-code/casings-in-coding/
   * @default camelCase
   */
  nameTransformer?: TransformCaseType;
  /**
   * Method used for query objects
   *
   * @default "PUT"
   */
  queryMethod?: "PUT" | "GET";
  /**
   * Largest message (bytes) a client may send on a bidirectional WebSocket operation; a bigger one closes the socket
   *
   * @default 1048576
   */
  webSocketMaxPayload?: number;
  /**
   * Most unconsumed messages a bidirectional operation may have queued; above it the socket closes with 4413
   *
   * @default 1000
   */
  webSocketMaxQueuedMessages?: number;
  /**
   * Most bytes of unconsumed messages a bidirectional operation may have queued; above it the socket closes with 4413
   *
   * @default 16777216
   */
  webSocketMaxQueuedBytes?: number;
  /**
   * Milliseconds between two keep-alive comments on an open `text/event-stream` response of a server-streaming
   * operation (0 disables them)
   *
   * @default 20000
   */
  streamKeepAliveInterval?: number;

  /**
   * Load parameters with defaults
   * @param params - the service parameters
   * @returns this for chaining
   */
  load(params: any = {}): this {
    super.load(params);
    this.nameTransformer ??= "camelCase";
    this.queryMethod ??= "PUT";
    this.webSocketMaxPayload ??= 1024 * 1024;
    this.webSocketMaxQueuedMessages ??= 1000;
    this.webSocketMaxQueuedBytes ??= 16 * 1024 * 1024;
    this.streamKeepAliveInterval ??= 20000;
    // Ensure url ends with /
    if (this.url && !this.url.endsWith("/")) {
      this.url += "/";
    }
    return this;
  }
}

/**
 * Truncate a string to a number of UTF-8 bytes without cutting a character (a close reason holds 123 bytes)
 * @param text - the text
 * @param max - the maximum byte length
 * @returns the truncated text
 */
export function truncateUtf8(text: string, max: number): string {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.length <= max) return text;
  let end = max;
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end).toString("utf8");
}

/**
 * REST transport that exposes model operations as RESTful HTTP routes.
 *
 * Instead of iterating operations flat, it walks the model tree
 * (parent/child relationships) to build nested URL prefixes like
 * `/companies/{pid.0}/users/{uuid}`.
 *
 * @WebdaModda
 */
export class RESTOperationsTransport<
  T extends RESTOperationsTransportParameters = RESTOperationsTransportParameters
> extends OperationsTransport<T> {
  /**
   * OpenAPI cache
   */
  openapiContent: string;

  /** Bidirectional operations served as WebSocket upgrades: path → operation id */
  webSocketRoutes: Map<string, string> = new Map();
  /** Shared WebSocket server (noServer: upgrades come from the HttpServer) */
  private webSocketServer?: WebSocketServer;
  /** HTTP servers the upgrade listener is already attached to */
  private webSocketServers: WeakSet<Server> = new WeakSet();
  private webSocketEvents = false;

  /**
   * Transform name using configured casing
   * @param name - the name to transform
   * @returns the transformed name
   */
  transformName(name: string): string {
    return TransformCase(name, this.parameters.nameTransformer);
  }

  /**
   * Resolve the service - set up OpenAPI route if configured
   * @returns this for chaining
   */
  resolve() {
    this.parameters.exposeOpenAPI ??= useCore().isDebug();
    super.resolve();
    if (this.parameters.exposeOpenAPI) {
      this.addRoute(".", ["GET"], this.openapi, { hidden: true });
    }
    // Bidirectional operations: accept WebSocket upgrades on every HTTP server once it listens
    if (!this.webSocketEvents) {
      this.webSocketEvents = true;
      const storage = useInstanceStorage();
      useCoreEvents("Webda.Init.Http" as any, (server: any) => this.attachWebSockets(server, storage));
    }
    return this;
  }

  /**
   * Find the bidirectional operation served on a request URL, the way the router matches HTTP paths: relative to the
   * HttpContext prefix, without the query string, with or without the global route prefix
   * @param uri - the request URL
   * @param prefix - the HttpContext prefix (a gateway stage...)
   * @returns the operation id, if any
   */
  webSocketOperationOf(uri: string, prefix: string = ""): string | undefined {
    const context = new HttpContext("localhost", "GET", uri);
    if (prefix) context.setPrefix(prefix);
    let path = context.getRelativeUri().split("?")[0];
    const routePrefix = useParameters().routePrefix || "";
    if (routePrefix && path.startsWith(routePrefix)) path = path.substring(routePrefix.length) || "/";
    return this.webSocketRoutes.get(path);
  }

  /**
   * Serve the bidirectional operations' upgrades on an HTTP server (once per server, only if there are any)
   * @param server - the server emitted by Webda.Init.Http
   * @param storage - the instance storage to run requests in
   */
  protected attachWebSockets(server: Server, storage: ReturnType<typeof useInstanceStorage>): void {
    if (this.webSocketRoutes.size === 0 || this.webSocketServers.has(server)) return;
    this.webSocketServers.add(server);
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      runWithInstanceStorage(storage, () => {
        const opId = this.webSocketOperationOf(req.url ?? "/");
        // Not ours (GraphQL subscriptions...): leave the socket to the other listeners
        if (!opId) return;
        this.upgradeOperation(opId, server, req, socket, head).catch(err => {
          useLog("ERROR", "WebSocket upgrade failed", opId, err);
          socket.destroy();
        });
      });
    });
  }

  /**
   * Answer an upgrade with an HTTP error
   * @param socket - the raw socket
   * @param status - HTTP status
   * @param message - reason phrase
   */
  private refuseUpgrade(socket: Duplex, status: number, message: string): void {
    socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  /**
   * Check the caller like a normal request (Webda.Request, router request filters, permission) and accept the WebSocket
   * @param opId - the bidirectional operation
   * @param server - the HTTP server
   * @param req - the upgrade request
   * @param socket - the raw socket
   * @param head - first packet of the upgraded stream
   * @returns a promise settled once the upgrade is accepted or refused
   */
  protected async upgradeOperation(
    opId: string,
    server: Server,
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ): Promise<void> {
    const http = Object.values(useCore().getServices()).find(
      s => (s as any).server === server && typeof (s as any).getContextFromRequest === "function"
    ) as any;
    const base: WebContext | undefined = http && (await http.getContextFromRequest(req));
    if (!base) return this.refuseUpgrade(socket, 400, "Bad Request");
    await base.init();
    const allowed = await runWithContext(base, async () => {
      try {
        emitCoreEvent("Webda.Request", { context: base });
      } catch {
        // listener error
      }
      return (await useRouter().checkRequest(base)) && canCallOperation(base, opId);
    });
    if (!allowed) return this.refuseUpgrade(socket, 403, "Forbidden");
    const storage = useInstanceStorage();
    this.webSocketServer ??= new WebSocketServer({
      noServer: true,
      maxPayload: this.parameters.webSocketMaxPayload
    });
    this.webSocketServer.handleUpgrade(req, socket, head, ws => {
      runWithInstanceStorage(storage, () => {
        this.runWebSocketOperation(opId, base.getHttpContext(), ws, base.getSession()).catch(err => {
          useLog("ERROR", "WebSocket operation failed", opId, err);
          ws.close(1011, "Internal server error");
        });
      });
    });
  }

  /**
   * Run a bidirectional operation over an accepted WebSocket: messages in, chunks out
   * @param opId - the operation
   * @param httpContext - the upgrade request
   * @param ws - the socket
   * @param session - the session loaded when the upgrade was authorized
   */
  protected async runWebSocketOperation(opId: string, httpContext: any, ws: WebSocket, session?: any): Promise<void> {
    const ctx = new WebSocketOperationContext(httpContext, ws, session);
    await ctx.init();
    const input = new AsyncQueue<unknown>();
    ctx.setExtension("operationInputStream", input);
    const maxQueued = this.parameters.webSocketMaxQueuedMessages;
    const maxQueuedBytes = this.parameters.webSocketMaxQueuedBytes;
    ws.on("message", data => {
      let message: unknown;
      try {
        message = JSON.parse(String(data));
      } catch {
        ws.close(4400, "Invalid JSON message");
        return;
      }
      input.push(message, rawLength(data));
      if (input.pending > maxQueued || input.pendingBytes > maxQueuedBytes) {
        // The operation does not keep up: stop it rather than buffering without limit
        const bytes = input.pendingBytes > maxQueuedBytes;
        ctx.cancel();
        input.end(true);
        ws.close(4413, bytes ? "Too many queued bytes" : "Too many queued messages");
      }
    });
    ws.on("error", err => useLog("DEBUG", "WebSocket error", opId, err));
    // The client is gone: the operation's writes throw and its pending read ends so its finally blocks run
    ws.on("close", () => {
      ctx.cancel();
      input.end();
    });
    try {
      await callOperation(ctx, opId);
      if (ctx.isCancelled) return;
      const output = ctx.getExtension("operationStreaming") ? undefined : ctx.getOutput();
      if (output) ws.send(output);
      ws.close(1000);
    } catch (err: any) {
      // Only a client that went away is a silent cancel: an operation raising it while connected is an error
      if (ctx.isCancelled) return;
      const status = typeof err?.getResponseCode === "function" ? err.getResponseCode() : undefined;
      if (status >= 400 && status < 500) {
        ws.close(4000 + status, truncateUtf8(String(err.message ?? "Error"), 123));
        return;
      }
      useLog("ERROR", `[WebSocket ${opId}] operation threw:`, err);
      ws.close(status ? 4000 + status : 1011, "Internal server error");
    }
  }

  /**
   * Override initTransport to walk the model tree instead of flat iteration.
   * For each model, we look up its operations and register REST routes.
   */
  protected initTransport(): void {
    const app = useApplication();
    const models = app.getModels();
    const operations = this.getOperations();

    // Build a set of models that have parents, and find root models
    const childModels = new Set<string>();
    for (const modelKey in models) {
      const model = models[modelKey];
      if (!model) continue;
      const metadata = useModelMetadata(model);
      if (!metadata) continue;
      if (!app.isFinalModel(metadata.Identifier)) continue;
      if (metadata.Relations?.parent) {
        childModels.add(metadata.Identifier);
      }
    }

    // Walk root models (no parent)
    for (const modelKey in models) {
      const model = models[modelKey];
      if (!model) continue;
      const metadata = useModelMetadata(model);
      if (!metadata) continue;
      if (!app.isFinalModel(metadata.Identifier)) continue;
      if (childModels.has(metadata.Identifier)) continue;

      // This is a root model - walk it
      this.walkModel(model, metadata, operations, this.parameters.url, 0);
    }

    // Expose non-model operations (e.g., bean @Operation methods) that have REST hints
    this.exposeServiceOperations(operations);
  }

  /**
   * Expose service/bean operations that have rest hints but aren't tied to model CRUD.
   * These are operations registered by Service.initOperations() from @Operation decorators.
   * @param operations - the filtered operations map
   */
  protected exposeServiceOperations(operations: Record<string, OperationDefinition>): void {
    for (const [opId, op] of Object.entries(operations)) {
      if (op.hidden) continue;
      // A client stream cannot be carried by a plain HTTP request: reachable over gRPC only
      if (getOperationStreaming(op) === "client") continue;
      // Skip if this operation was already handled by model tree walk
      if (op.context?.model) continue;

      let path: string;
      let methods: HttpMethodType[];

      if (op.rest) {
        const rest = op.rest;
        path = rest.path.startsWith("/") ? rest.path : `${this.parameters.url}${rest.path}`;
        methods = [rest.method.toUpperCase() as HttpMethodType];
      } else {
        // Default: expose as operationId.toLowerCase().replace(".", "/")
        path = `${this.parameters.url}${opId.toLowerCase().replace(/\./g, "/")}`;
        methods = ["PUT"];
      }

      if (getOperationStreaming(op) === "bidi") {
        // Served as a WebSocket upgrade on this path; a plain request cannot carry a bidirectional stream
        if (path.includes("{")) {
          this.log("WARN", `${opId} is bidirectional but its path ${path} has parameters: not served over WebSocket`);
        } else {
          this.webSocketRoutes.set(path, opId);
        }
        this.addRoute(
          path,
          [...new Set<HttpMethodType>(["GET", ...methods])],
          async () => {
            throw new WebdaError.HttpError("Upgrade Required: open a WebSocket on this URL", 426);
          },
          { get: { tags: op.tags || [], summary: `${op.summary || opId} (WebSocket)`, operationId: opId } }
        );
        continue;
      }

      const openapi: OpenAPIWebdaDefinition = {
        [methods[0].toLowerCase()]: {
          tags: op.tags || [],
          summary: op.summary || opId,
          operationId: opId,
          ...(getOperationStreaming(op) === "server" ? { responses: this.streamedResponses() } : {})
        }
      };
      this.addRoute(
        path,
        methods,
        async (context: WebContext) => {
          await this.runOperation(context, opId);
        },
        openapi
      );
    }
  }

  /**
   * The OpenAPI responses of a server-streaming operation
   * @returns the 200 response with both stream formats
   */
  protected streamedResponses(): Record<string, any> {
    return {
      "200": {
        description:
          "Stream of chunks: one JSON line each (application/x-ndjson), or one `data:` event each when `Accept` is " +
          "text/event-stream, ended by an `end` event. An error after the first chunk is a last `error` event or " +
          '`{"error": {"message", "code"}}` line.',
        content: {
          "application/x-ndjson": { schema: { type: "string", description: "One JSON value per line" } },
          "text/event-stream": { schema: { type: "string", description: "Server-sent events with a JSON `data`" } }
        }
      }
    };
  }

  /**
   * Run an operation for a route: a server-streaming one is streamed to the client as its generator yields, any other
   * is called and its result flushed with the response
   * @param context - the request context
   * @param operationId - the operation
   * @returns a promise settled once the operation is done (a stream: once the response is over)
   */
  protected async runOperation(context: WebContext, operationId: string): Promise<void> {
    const response = context._stream as any;
    if (
      getOperationStreaming(useInstanceStorage().operations?.[operationId]) !== "server" ||
      typeof response?.writeHead !== "function"
    ) {
      return callOperation(context, operationId);
    }
    return this.streamOperation(context, operationId, response);
  }

  /**
   * Stream a server-streaming operation: NDJSON, or server-sent events when the client accepts them
   *
   * The streaming context is built here, from the request's context, rather than by the HttpServer: only these routes
   * need it, and permissions, validation and events still go through `callOperation` on the request's input. Until the
   * first chunk an error is a normal HTTP error (thrown to the HttpServer); after it, the error is the last event or
   * line of the stream.
   * @param context - the request context
   * @param operationId - the operation
   * @param response - the HTTP response
   * @returns a promise settled once the response is over
   */
  protected async streamOperation(context: WebContext, operationId: string, response: ServerResponse): Promise<void> {
    const accept = context.getHttpContext().getUniqueHeader("accept", "") ?? "";
    const format: RestStreamFormat = accept.includes("text/event-stream") ? "sse" : "ndjson";
    const stream = new RestStreamingOperationContext(
      context.getHttpContext(),
      response,
      format,
      context.getSession(),
      this.parameters.streamKeepAliveInterval,
      context.getResponseHeaders(),
      context.getSetCookieHeaders()
    );
    await stream.init();
    stream.setParameters(context.getParameters());
    stream.startKeepAlive();
    try {
      await callOperation(stream, operationId);
    } catch (err: any) {
      stream.stopKeepAlive();
      // The client went away: nothing to tell
      if (stream.isCancelled || stream.disconnected) return stream.finish();
      // Nothing sent yet: a normal HTTP error response
      if (!stream.hasStarted) {
        stream.abortBeforeStart();
        throw err;
      }
      const status = typeof err?.getResponseCode === "function" ? err.getResponseCode() : undefined;
      const clientError = status >= 400 && status < 500;
      if (!clientError) useLog("ERROR", `[REST ${operationId}] streamed operation threw:`, err);
      await stream.writeError(clientError ? String(err.message ?? "Error") : "Internal server error", status || 500);
      return stream.finish();
    }
    stream.stopKeepAlive();
    if (stream.isCancelled) return stream.finish();
    if (!stream.getExtension("operationStreaming")) {
      // Not a generator after all: a normal response, with the status and headers the operation set
      if (stream.statusCode && stream.statusCode !== 204) context.statusCode = stream.statusCode;
      for (const [name, value] of Object.entries(stream.getResponseHeaders())) context.setHeader(name, <any>value);
      const output = stream.getOutput();
      if (output !== undefined) {
        context.setHeader("Content-type", "application/json");
        context.write(output);
      }
      return;
    }
    return stream.finish(true);
  }

  /**
   * Recursively walk a model and its children, registering routes at each level
   * @param model - the model class
   * @param metadata - model metadata
   * @param operations - filtered operations map
   * @param basePrefix - URL prefix from parent context
   * @param depth - nesting depth for parent id parameters
   */
  protected walkModel(
    model: ModelClass,
    metadata: ModelMetadata,
    operations: Record<string, OperationDefinition>,
    basePrefix: string,
    depth: number
  ): void {
    const app = useApplication();
    const { Relations: relations, Identifier, Plural: plural, Actions: actions } = metadata;
    const injectAttribute = relations?.parent?.attribute;
    const shortId = Identifier.split("/").pop();
    const name = plural;

    // Build prefix for this model
    const prefix = basePrefix + this.transformName(name);

    // Register the model url with the router
    useRouter()?.registerModelUrl(app.getModelId(model), prefix);

    // Register routes for standard CRUD operations
    this.exposeQueryRoute(prefix, plural, shortId, Identifier, depth, injectAttribute, operations);
    this.exposeCreateRoute(prefix, shortId, Identifier, depth, injectAttribute, operations);
    this.exposeDeleteRoute(prefix, shortId, Identifier, operations);
    this.exposeUpdateRoute(prefix, shortId, Identifier, operations);
    this.exposeGetRoute(prefix, shortId, Identifier, operations);

    // Register action routes
    const actionsName = Object.keys(actions);
    actionsName
      .filter(k => !["create", "update", "delete", "get", "query"].includes(k))
      .forEach(actionName => {
        this.exposeActionRoute(prefix, shortId, Identifier, actionName, actions[actionName], depth, injectAttribute);
      });

    // Register behavior routes
    (relations.behaviors || []).forEach(behavior => {
      this.exposeBehaviorRoutes(prefix, shortId, Identifier, name, behavior);
    });

    // Find children (models whose parent points to this model)
    const childPrefix = prefix + `/{pid.${depth}}/`;
    const models = app.getModels();
    for (const childKey in models) {
      const childModel = models[childKey];
      if (!childModel) continue;
      const childMetadata = useModelMetadata(childModel);
      if (!childMetadata) continue;
      if (!app.isFinalModel(childMetadata.Identifier)) continue;
      if (!childMetadata.Relations?.parent) continue;
      if (childMetadata.Relations.parent.model !== Identifier) continue;

      this.walkModel(childModel, childMetadata, operations, childPrefix, depth + 1);
    }
  }

  /**
   * Register query route for a model
   * @param prefix - the URL prefix for this model
   * @param plural - the pluralized model name
   * @param shortId - the short model identifier
   * @param identifier - the full model identifier
   * @param depth - nesting depth for parent id parameters
   * @param injectAttribute - parent attribute to inject in queries
   * @param operations - the filtered operations map
   */
  protected exposeQueryRoute(
    prefix: string,
    plural: string,
    shortId: string,
    identifier: string,
    depth: number,
    injectAttribute: string | undefined,
    operations: Record<string, OperationDefinition>
  ): void {
    const operationId = `${plural}.Query`;
    if (!operations[operationId]) return;

    const openapi: OpenAPIWebdaDefinition = {
      [this.parameters.queryMethod.toLowerCase()]: {
        tags: [shortId],
        summary: `Query ${shortId}`,
        operationId,
        requestBody:
          this.parameters.queryMethod === "GET"
            ? undefined
            : {
                content: {
                  "application/json": {
                    schema: {
                      properties: {
                        q: {
                          type: "string"
                        }
                      }
                    }
                  }
                }
              },
        parameters:
          this.parameters.queryMethod === "GET"
            ? [
                {
                  name: "q",
                  in: "query",
                  description: "Query to execute",
                  schema: {
                    type: "string"
                  }
                }
              ]
            : [],
        responses: {
          "200": {
            description: "Operation success",
            content: {
              "application/json": {
                schema: {
                  properties: {
                    continuationToken: {
                      type: "string"
                    },
                    results: {
                      type: "array",
                      items: {
                        $ref: `#/components/schemas/${identifier}`
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            description: "Query is invalid"
          },
          "403": {
            description: "You don't have permissions"
          }
        }
      }
    };

    this.addRoute(
      `${prefix}${this.parameters.queryMethod === "GET" ? "{?q?}" : ""}`,
      [this.parameters.queryMethod],
      async (context: WebContext) => {
        let queryString = "";
        const parentId = `pid.${depth - 1}`;
        if (context.getHttpContext().getMethod() === "PUT") {
          queryString = (await context.getInput()).q ?? "";
          context.clearInput();
        } else {
          queryString = context.parameter("q", "");
        }
        if (typeof queryString !== "string") {
          throw new WebdaError.BadRequest("Query must be a string");
        }
        let query: QueryValidator;
        try {
          query = new QueryValidator(queryString);
        } catch (err) {
          throw new WebdaError.BadRequest(`Invalid query ${queryString}`);
        }

        // Inject parent attribute
        if (injectAttribute) {
          // The parent id comes from the URL: bind it as an escaped value
          query.merge(bind(`${injectAttribute} = ?`, [context.parameter(parentId)]));
        }
        context.getParameters().query = query.toString();
        return callOperation(context, operationId);
      },
      openapi
    );
  }

  /**
   * Register create route for a model
   * @param prefix - the URL prefix for this model
   * @param shortId - the short model identifier
   * @param identifier - the full model identifier
   * @param depth - nesting depth for parent id parameters
   * @param injectAttribute - parent attribute to inject on create
   * @param operations - the filtered operations map
   */
  protected exposeCreateRoute(
    prefix: string,
    shortId: string,
    identifier: string,
    depth: number,
    injectAttribute: string | undefined,
    operations: Record<string, OperationDefinition>
  ): void {
    const operationId = `${shortId}.Create`;
    if (!operations[operationId]) return;

    const openapi: OpenAPIWebdaDefinition = {
      post: {
        tags: [shortId],
        summary: `Create ${shortId}`,
        operationId,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: `#/components/schemas/${identifier}`
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Operation success",
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${identifier}`
                }
              }
            }
          },
          "400": {
            description: "Invalid input"
          },
          "403": {
            description: "You don't have permissions"
          },
          "409": {
            description: "Object already exists"
          }
        }
      }
    };

    // Lookup pkFields from the operation context to build a Location header
    // that uses the model's real primary key (slug, uuid, composite, etc.).
    const createCtx = operations[operationId]?.context as { pkFields?: string[] } | undefined;
    const pkFields = createCtx?.pkFields ?? ["uuid"];
    this.addRoute(
      `${prefix}`,
      ["POST"],
      async (context: WebContext) => {
        // Inject the parent attribute
        if (injectAttribute) {
          (await context.getInput())[injectAttribute] = context.parameter(`pid.${depth - 1}`);
        }
        await callOperation(context, operationId);
        // Add Location for successful creates without changing the status code —
        // the rest of the framework (and the shipped tests) assume 2xx without
        // the 200→201 upgrade, so surface the URL via header only.
        if (context.statusCode < 300 || context.statusCode === 204) {
          const output = context.getOutput();
          if (output) {
            try {
              const parsed = typeof output === "string" ? JSON.parse(output) : output;
              const pkParts = pkFields.map(f => parsed?.[f]).filter(v => v !== undefined && v !== null);
              if (pkParts.length === pkFields.length) {
                context.setHeader("Location", `${context.getHttpContext().getAbsoluteUrl()}/${pkParts.join("/")}`);
              }
            } catch {
              // Not JSON, skip Location
            }
          }
        }
      },
      openapi
    );
  }

  /**
   * Register delete route for a model
   * @param prefix - the URL prefix for this model
   * @param shortId - the short model identifier
   * @param identifier - the full model identifier
   * @param operations - the filtered operations map
   */
  protected exposeDeleteRoute(
    prefix: string,
    shortId: string,
    identifier: string,
    operations: Record<string, OperationDefinition>
  ): void {
    const operationId = `${shortId}.Delete`;
    if (!operations[operationId]) return;

    const openapi: OpenAPIWebdaDefinition = {
      delete: {
        tags: [shortId],
        operationId,
        description: `Delete ${shortId} if the permissions allow`,
        summary: `Delete a ${shortId}`,
        responses: {
          "204": {
            description: "Operation success"
          },
          "403": {
            description: "You don't have permissions"
          },
          "404": {
            description: "Unknown object"
          }
        }
      }
    };

    // Use the operation's declared REST path so the URL params match the model's
    // actual primary-key field names (e.g. {slug} for Tag, {follower}/{following}
    // for UserFollow). Fall back to {uuid} for legacy operations.
    const pathSuffix =
      typeof operations[operationId].rest === "object"
        ? (operations[operationId].rest as any).path || "{uuid}"
        : "{uuid}";
    this.addRoute(
      `${prefix}/${pathSuffix}`,
      ["DELETE"],
      async (context: WebContext) => {
        await callOperation(context, operationId);
        // Convention: 204 No Content
        if (context.statusCode < 300 || context.statusCode === 204) {
          context.writeHead(204);
        }
      },
      openapi
    );
  }

  /**
   * Register update (PUT) and patch (PATCH) routes for a model
   * @param prefix - the URL prefix for this model
   * @param shortId - the short model identifier
   * @param identifier - the full model identifier
   * @param operations - the filtered operations map
   */
  protected exposeUpdateRoute(
    prefix: string,
    shortId: string,
    identifier: string,
    operations: Record<string, OperationDefinition>
  ): void {
    const updateOpId = `${shortId}.Update`;
    const patchOpId = `${shortId}.Patch`;
    if (!operations[updateOpId] && !operations[patchOpId]) return;

    const hasUpdate = operations[updateOpId] !== undefined;
    const hasPatch = operations[patchOpId] !== undefined;
    const describe = (operationId: string, verb: "Update" | "Patch") => ({
      tags: [shortId],
      operationId,
      description: `${verb} ${shortId} if the permissions allow`,
      summary: operations[operationId]?.summary ?? `${verb} a ${shortId}`,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              $ref: `#/components/schemas/${identifier}`
            }
          }
        }
      },
      responses: {
        "204": {
          description: "Operation success"
        },
        "400": {
          description: "Invalid input"
        },
        "403": {
          description: "You don't have permissions"
        },
        "404": {
          description: "Unknown object"
        }
      }
    });
    // A verb without its own operation is served by the other one (see the
    // handler below); document it without an operationId, which must be unique
    const servedBy = (info: ReturnType<typeof describe>) => {
      const { operationId: _servedBy, ...rest } = info;
      return rest;
    };
    const updateInfo = hasUpdate ? describe(updateOpId, "Update") : undefined;
    const patchInfo = hasPatch ? describe(patchOpId, "Patch") : undefined;
    const openapi: OpenAPIWebdaDefinition = {
      put: updateInfo ?? servedBy(patchInfo!),
      patch: patchInfo ?? servedBy(updateInfo!)
    };

    // Use the update op's declared REST path so URL params match the PK fields.
    const updateOp = operations[updateOpId] ?? operations[patchOpId];
    const pathSuffix = typeof updateOp?.rest === "object" ? (updateOp.rest as any).path || "{uuid}" : "{uuid}";
    // DomainService registers both `${shortId}.Update` and `${shortId}.Patch`;
    // when an application declares only one of them, route both verbs to it
    // (modelUpdate's load() already merges, which is patch semantics).
    this.addRoute(
      `${prefix}/${pathSuffix}`,
      ["PUT", "PATCH"],
      (context: WebContext) => {
        const method = context.getHttpContext().getMethod();
        // Fall back to whichever operation is registered so users can override
        // just one of Update/Patch without breaking the other HTTP verb.
        if (method === "PATCH") {
          return callOperation(context, hasPatch ? patchOpId : updateOpId);
        }
        return callOperation(context, hasUpdate ? updateOpId : patchOpId);
      },
      openapi
    );
  }

  /**
   * Register get route for a model
   * @param prefix - the URL prefix for this model
   * @param shortId - the short model identifier
   * @param identifier - the full model identifier
   * @param operations - the filtered operations map
   */
  protected exposeGetRoute(
    prefix: string,
    shortId: string,
    identifier: string,
    operations: Record<string, OperationDefinition>
  ): void {
    const operationId = `${shortId}.Get`;
    if (!operations[operationId]) return;

    const openapi: OpenAPIWebdaDefinition = {
      get: {
        tags: [shortId],
        description: `Retrieve ${shortId} model if permissions allow`,
        summary: `Retrieve a ${shortId}`,
        operationId,
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${identifier}`
                }
              }
            }
          },
          "400": {
            description: "Object is invalid"
          },
          "403": {
            description: "You don't have permissions"
          },
          "404": {
            description: "Unknown object"
          }
        }
      }
    };

    const pathSuffix =
      typeof operations[operationId].rest === "object"
        ? (operations[operationId].rest as any).path || "{uuid}"
        : "{uuid}";
    this.addRoute(
      `${prefix}/${pathSuffix}`,
      ["GET"],
      (context: WebContext) => callOperation(context, operationId),
      openapi
    );
  }

  /**
   * Register action route for a model
   * @param prefix - the URL prefix for this model
   * @param shortId - the short model identifier
   * @param identifier - the full model identifier
   * @param actionName - the name of the action
   * @param action - the action definition
   * @param depth - nesting depth for parent id parameters
   * @param injectAttribute - parent attribute to inject
   */
  protected exposeActionRoute(
    prefix: string,
    shortId: string,
    identifier: string,
    actionName: string,
    action: ModelAction,
    depth: number,
    injectAttribute: string | undefined
  ): void {
    const actionOperationName = actionName.substring(0, 1).toUpperCase() + actionName.substring(1);
    const operationId = `${shortId}.${actionOperationName}`;
    const openapi: OpenAPIWebdaDefinition = {
      ...action.openapi
    };
    (action.methods || ["PUT"]).forEach((method, index) => {
      openapi[method.toLowerCase()] = {
        tags: [shortId],
        // operationIds must be unique: when an action accepts several methods,
        // the first one carries the operation the route dispatches to
        ...(index === 0 ? { operationId } : {}),
        ...(action.openapi?.[method.toLowerCase()] ?? {})
      };
    });
    if (getOperationStreaming(useInstanceStorage().operations?.[operationId]) === "server") {
      Object.keys(openapi)
        .filter(k => ["get", "post", "put", "patch", "delete"].includes(k))
        .forEach(k => {
          openapi[k].responses = { ...this.streamedResponses(), ...openapi[k].responses };
        });
    }
    if (hasSchema(`${identifier}.${actionName}.input`)) {
      Object.keys(openapi)
        .filter(k => ["get", "post", "put", "patch", "delete"].includes(k))
        .forEach(k => {
          openapi[k].requestBody = {
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${identifier}.${actionName}.input`
                }
              }
            }
          };
        });
    }
    if (
      hasSchema(`${identifier}.${actionName}.output`) &&
      getOperationStreaming(useInstanceStorage().operations?.[operationId]) !== "server"
    ) {
      Object.keys(openapi)
        .filter(k => ["get", "post", "put", "patch", "delete"].includes(k))
        .forEach(k => {
          openapi[k].responses ??= {};
          openapi[k].responses["200"] ??= {};
          openapi[k].responses["200"].content = {
            "application/json": {
              schema: {
                $ref: `#/components/schemas/${identifier}.${actionName}.output`
              }
            }
          };
        });
    }
    this.addRoute(
      action.global ? `${prefix}/${actionName}` : `${prefix}/{uuid}/${actionName}`,
      action.methods || ["PUT"],
      async (context: WebContext) => {
        if (injectAttribute) {
          context.getParameters()[injectAttribute] = context.parameter(`pid.${depth - 1}`);
          context.getParameters()[`pid.${depth - 1}`] = undefined;
        }
        await this.runOperation(context, operationId);
      },
      openapi
    );
  }

  /**
   * Register routes for every `@Action` on every Behavior attribute of a
   * model. The default URL pattern is `{prefix}/{uuid}/{attribute}.{action}`
   * (PUT) — the dot disambiguates Behavior calls from nested-resource routing.
   *
   * Authors can override the route via `@Action({ rest: { route, method } })`.
   * `addBehaviorOperations` resolves that hint and writes the final
   * `rest.method`/`rest.path` on the registered operation; this method just
   * mirrors what's there, falling back to the dot-notation default if no
   * hint was set.
   *
   * Each route dispatches the registered behavior operation
   * (`{ShortId}.{AttributeCap}.{ActionCap}`). The dispatcher itself
   * (`modelBehaviorAction`) handles model load, `canAct` gating, and method
   * invocation — this method only wires the HTTP surface.
   *
   * Schema decoration on the OpenAPI doc is best-effort — we lean on
   * `hasSchema()` (the AJV registry) to decide whether to emit
   * `requestBody` / `responses` `$ref`s.
   *
   * @param prefix - the URL prefix for this model (e.g. `/api/users`)
   * @param shortId - the short model identifier (e.g. `User`)
   * @param identifier - the full model identifier (e.g. `MyApp/User`) — accepted
   *   for symmetry with `walkModel`'s caller signature even though we don't currently use it
   * @param name - the model display name used in OpenAPI tags
   * @param behavior - the Behavior attribute relation to expose
   */
  protected exposeBehaviorRoutes(
    prefix: string,
    shortId: string,
    identifier: string,
    name: string,
    behavior: ModelGraphBehaviorDefinition
  ): void {
    void identifier;
    void name;
    const app = useApplication();
    const behaviorMeta = app.getBehaviorMetadata(behavior.behavior);
    if (!behaviorMeta) {
      return;
    }
    const attributeCap = behavior.attribute.substring(0, 1).toUpperCase() + behavior.attribute.substring(1);

    const ops = useInstanceStorage().operations;
    Object.keys(behaviorMeta.Actions || {}).forEach(actionName => {
      const actionCap = actionName.substring(0, 1).toUpperCase() + actionName.substring(1);
      const operationId = `${shortId}.${attributeCap}.${actionCap}`;

      // Read REST hints from the registered operation. addBehaviorOperations
      // resolves the action's `rest: { route, method }` decorator option (if
      // any) and writes the final method+path here, so we just mirror it.
      const op = ops?.[operationId];
      const restHint = op?.rest && typeof op.rest === "object" ? op.rest : undefined;
      const httpMethod = ((restHint?.method ?? "put") as string).toUpperCase() as HttpMethodType;
      const methodKey = httpMethod.toLowerCase();
      // `rest.path` is relative to the model prefix and starts with `{uuid}/`.
      const relativePath = restHint?.path ?? `{uuid}/${behavior.attribute}.${actionName}`;
      const fullPath = `${prefix}/${relativePath}`;

      const openapi: OpenAPIWebdaDefinition = {
        [methodKey]: {
          tags: [shortId],
          summary: `${actionCap} on ${shortId}.${behavior.attribute}`,
          operationId
        }
      };
      const inputSchema = `${behavior.behavior}.${actionName}.input`;
      const outputSchema = `${behavior.behavior}.${actionName}.output`;
      if (hasSchema(inputSchema)) {
        openapi[methodKey].requestBody = {
          content: {
            "application/json": {
              schema: {
                $ref: `#/components/schemas/${inputSchema}`
              }
            }
          }
        };
      }
      if (getOperationStreaming(op) === "server") {
        openapi[methodKey].responses = this.streamedResponses();
      } else if (hasSchema(outputSchema)) {
        openapi[methodKey].responses = {
          "200": {
            description: "Operation success",
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${outputSchema}`
                }
              }
            }
          }
        };
      }

      this.addRoute(
        fullPath,
        [httpMethod],
        async (context: WebContext) => this.runOperation(context, operationId),
        openapi
      );
    });
  }

  /**
   * No-op: route exposure is handled entirely by initTransport's tree walk
   * @param _operationId - the operation identifier (unused)
   * @param _definition - the operation definition (unused)
   */
  exposeOperation(_operationId: string, _definition: OperationDefinition): void {
    // Handled by initTransport's tree walk
  }

  /**
   * Serve the openapi with the swagger-ui
   * @param ctx - the web context
   */
  async openapi(ctx: WebContext) {
    this.openapiContent ??= SWAGGER_HTML.replace(/\{\{VERSION}}/g, this.parameters.swaggerVersion).replace(
      "{{OPENAPI}}",
      JSON.stringify(useRouter().exportOpenAPI(true))
    );
    ctx.write(this.openapiContent);
  }
}
