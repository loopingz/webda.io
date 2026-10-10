import {
  AsyncQueue,
  BuildCommand,
  HttpContext,
  OperationDefinition,
  OperationsTransport,
  OperationsTransportParameters,
  WebdaError,
  callOperation,
  emitCoreEvent,
  getOperationStreaming,
  runWithContext,
  runWithInstanceStorage,
  useApplication,
  useCore,
  useInstanceStorage,
  useRouter
} from "@webda/core";
import { useLog } from "@webda/workout";
import * as protoLoader from "@grpc/proto-loader";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { GrpcOperationContext, toGrpcMessage } from "./grpc-context.js";
import { GrpcStream, GrpcStatus } from "./grpc-stream.js";
import { generateProto } from "./proto-generator.js";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Parameters for the gRPC service
 */
export class GrpcServiceParameters extends OperationsTransportParameters {
  /**
   * Path to the generated .proto file
   * @default ".webda/app.proto"
   */
  protoFile?: string;

  /**
   * Protobuf package name
   * @default "webda"
   */
  packageName?: string;

  /**
   * Most unconsumed messages a client or bidirectional operation may have queued; above it the call fails with
   * RESOURCE_EXHAUSTED
   *
   * @default 1000
   */
  maxQueuedMessages?: number;

  /**
   * Most bytes of unconsumed messages a client or bidirectional operation may have queued; above it the call fails
   * with RESOURCE_EXHAUSTED
   *
   * @default 16777216
   */
  maxQueuedBytes?: number;

  /**
   * Load and apply default parameter values.
   * @param params - raw configuration object to load into this parameters instance
   * @returns this instance with defaults applied
   */
  load(params: any = {}): this {
    super.load(params);
    this.protoFile ??= ".webda/app.proto";
    this.packageName ??= "webda";
    this.maxQueuedMessages ??= 1000;
    this.maxQueuedBytes ??= 16 * 1024 * 1024;
    return this;
  }
}

/**
 * gRPC transport service.
 *
 * Exposes Webda operations as gRPC services over HTTP/2.
 * Hooks into the HttpServer via the `Webda.Init.Http` event to intercept
 * requests with `content-type: application/grpc`.
 *
 * Run `webdac build` to generate the .proto file from operations.
 *
 * @WebdaModda
 */
export class GrpcService<T extends GrpcServiceParameters = GrpcServiceParameters> extends OperationsTransport<T> {
  /** Loaded protobuf definitions */
  private definitions: protoLoader.PackageDefinition;
  /** Map of gRPC path → operation ID */
  private rpcToOperation: Map<string, string> = new Map();
  /** Map of gRPC path → method definition */
  private rpcMethods: Map<string, protoLoader.MethodDefinition<any, any>> = new Map();

  /**
   * @param params - raw service parameters
   * @returns the loaded parameters (with the operations include/exclude filter)
   */
  static createConfiguration(params: any = {}): GrpcServiceParameters {
    return new GrpcServiceParameters().load(params);
  }

  /**
   * Generate a .proto file from the current operation registry.
   *
   * @returns a promise that resolves when the proto file has been written to disk
   */
  @BuildCommand({
    description: "Generate protobuf definition from operations",
    requires: ["rest-domain"]
  })
  async build(): Promise<void> {
    const outPath = this.parameters.protoFile;
    const operations = this.getOperations();
    const app = useApplication();
    const schemas: Record<string, any> = { ...(app.getSchemas?.() || {}) };
    // Fold per-model input schemas into the flat schemas map so that `$ref`
    // lookups like `WebdaSample/Post` resolve to a concrete message shape —
    // `getSchemas()` only returns operation-level schemas, not model ones.
    const models = app.getModels?.() || {};
    for (const modelId of Object.keys(models)) {
      const metadata = (models[modelId] as any)?.Metadata;
      const inputSchema = metadata?.Schemas?.Input;
      if (inputSchema && !schemas[modelId]) {
        schemas[modelId] = inputSchema;
      }
    }

    const proto = generateProto(operations, schemas, this.parameters.packageName);

    // Ensure directory exists
    const dir = dirname(outPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(outPath, proto, "utf-8");
    this.log("INFO", `Generated proto file: ${outPath}`);
    this.log("INFO", `  ${Object.keys(operations).length} operations → ${this.countServices(operations)} services`);
  }

  /**
   * Count unique service prefixes in operations
   * @param operations - map of operation IDs to their definitions
   * @returns the number of distinct gRPC service groups derived from operation prefixes
   */
  private countServices(operations: Record<string, any>): number {
    const prefixes = new Set<string>();
    for (const opId of Object.keys(operations)) {
      const dot = opId.indexOf(".");
      prefixes.add(dot > 0 ? opId.substring(0, dot) : "Default");
    }
    return prefixes.size;
  }

  /**
   * Load the .proto file and map its RPC methods to operations (also callable after registering operations late)
   */
  loadDefinitions(): void {
    if (!existsSync(this.parameters.protoFile)) {
      useLog("WARN", `Proto file not found: ${this.parameters.protoFile}. Run 'webdac build' to generate it.`);
      return;
    }
    try {
      this.definitions = protoLoader.loadSync(this.parameters.protoFile, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      });
      this.rpcToOperation.clear();
      this.rpcMethods.clear();
      this.buildRpcMap();
      useLog(
        "INFO",
        `Loaded gRPC definitions from ${this.parameters.protoFile} — ${this.rpcToOperation.size} RPC methods mapped`
      );
    } catch (err: any) {
      useLog("WARN", `Failed to load proto file: ${err.message}`);
    }
  }

  /**
   * Initialize the gRPC transport: load proto, build RPC map, hook into HTTP/2.
   * @returns a promise resolving to this service instance once initialization is complete
   */
  async init(): Promise<this> {
    await super.init();

    this.loadDefinitions();

    // Plug the gRPC dispatcher into every HttpServer instance in the app.
    // Serving both REST (HTTP/1.1 or TLS+ALPN) and plaintext gRPC (h2c) means
    // configuring two HttpServer services with different protocols; gRPC
    // doesn't care which one — it claims any `application/grpc` request.
    //
    // AsyncLocalStorage doesn't reliably cross HTTP/2 data events, so capture
    // the InstanceStorage here and re-enter it per request.
    const capturedStorage = useInstanceStorage();
    const servers = Object.values(useCore().getServices()).filter(
      s => typeof (s as any).registerRequestInterceptor === "function"
    );
    if (servers.length === 0) {
      useLog("WARN", "No HttpServer found — gRPC cannot register its interceptor");
      return this;
    }
    const interceptor = (req: IncomingMessage, res: ServerResponse): boolean => {
      const contentType = (req.headers["content-type"] as string) || "";
      if (!contentType.startsWith("application/grpc")) return false;
      runWithInstanceStorage(capturedStorage, () => {
        this.handleGrpcRequest(req as any, res as any).catch(err => {
          useLog("ERROR", "[GrpcService] handler failed:", err);
        });
      });
      return true;
    };
    for (const server of servers) {
      (server as any).registerRequestInterceptor(interceptor);
    }

    return this;
  }

  /**
   * Build the mapping from gRPC path → operation ID using the loaded proto definitions.
   */
  private buildRpcMap(): void {
    if (!this.definitions) return;

    const operations = this.getOperations();
    const pkg = this.parameters.packageName;

    // `protoLoader.loadSync` returns a flat map where service entries are plain
    // objects keyed by method name (each method has a `.path`), mixed with
    // top-level message types. Walk both levels so we catch every method.
    const visitMethod = (methodDef: any) => {
      if (!methodDef?.path) return;
      const parts = (methodDef.path as string).split("/").filter(Boolean);
      if (parts.length !== 2) return;
      const [fullService, method] = parts;
      const serviceName = fullService.replace(`${pkg}.`, "").replace(/Service$/, "");
      const opId = `${serviceName}.${method}`;
      if (operations[opId]) {
        this.rpcToOperation.set(methodDef.path, opId);
        this.rpcMethods.set(methodDef.path, methodDef);
      }
    };
    for (const def of Object.values(this.definitions)) {
      if (typeof def !== "object" || def === null) continue;
      if ((def as any).path) {
        visitMethod(def);
      } else {
        // Service object — iterate its method members
        for (const inner of Object.values(def)) {
          if (typeof inner === "object" && (inner as any)?.path) visitMethod(inner);
        }
      }
    }
  }

  /**
   * The request line and metadata of a gRPC call as an HttpContext (HTTP/2 pseudo-headers removed)
   * @param req - the HTTP/2 request
   * @returns the http context
   */
  private httpContextOf(req: IncomingMessage): HttpContext {
    const raw = req.headers as Record<string, string | string[]>;
    const authority = (raw[":authority"] as string) || (raw.host as string) || "localhost";
    const [hostname, port] = authority.split(":");
    const headers = Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith(":")));
    return new HttpContext(hostname, "POST", req.url || "/", "http", port || "80", headers as any);
  }

  /**
   * Handle an incoming gRPC request: one path for the four modes. Incoming messages feed the operation (as its
   * input, or as the stream in `operationInputStream`), streamed output is sent as it is produced.
   *
   * Called by the HttpServer when content-type is application/grpc.
   *
   * @param req - HTTP/2 request carrying the gRPC method path and framed message body
   * @param res - HTTP/2 response used to write gRPC frames and trailers
   * @returns a promise that resolves when the response has been fully sent
   */
  async handleGrpcRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const grpcPath = req.url;
    const opId = this.rpcToOperation.get(grpcPath);
    const methodDef = this.rpcMethods.get(grpcPath);

    if (!opId || !methodDef) {
      res.writeHead(200, {
        "content-type": "application/grpc",
        "grpc-status": String(GrpcStatus.UNIMPLEMENTED),
        "grpc-message": encodeURIComponent(`Method not found: ${grpcPath}`)
      });
      res.end();
      return;
    }

    const stream = new GrpcStream(req, res, methodDef);
    const streaming = getOperationStreaming(this.getOperations()[opId]);
    const ctx = new GrpcOperationContext(this.httpContextOf(req), stream, res);
    const input = new AsyncQueue<unknown>();
    // Handlers first: data may arrive while the session loads
    stream.onMessage((message, size) => {
      input.push(this.cleanMessage(message), size);
      const bytes = input.pendingBytes > this.parameters.maxQueuedBytes;
      if ((bytes || input.pending > this.parameters.maxQueuedMessages) && !finished()) {
        // The operation does not keep up: stop it rather than buffering without limit
        stream.sendError(GrpcStatus.RESOURCE_EXHAUSTED, bytes ? "Too many queued bytes" : "Too many queued messages");
        ctx.cancel();
        input.end(true);
      }
    });
    stream.onEnd(() => input.end());
    stream.onCancel(() => {
      ctx.cancel();
      input.end();
    });
    // Whatever ends the response (client gone, or the stream failing on a bad frame): stop the operation
    res.on("close", () => {
      ctx.cancel();
      input.end();
    });
    // The stream may fail itself (bad frame, ...): it then ends the response, nothing more must be written
    const finished = () => ctx.isCancelled || (res as any).writableEnded;

    try {
      await ctx.init();
      const allowed = await runWithContext(ctx, async () => {
        try {
          emitCoreEvent("Webda.Request", { context: ctx });
        } catch {
          // listener error
        }
        return useRouter().checkRequest(ctx);
      });
      if (!allowed) {
        if (!finished()) stream.sendError(GrpcStatus.PERMISSION_DENIED, "Forbidden");
        return;
      }
      if (streaming === "client" || streaming === "bidi") {
        ctx.setExtension("operationInputStream", input);
      } else {
        const first = await input.next();
        if (finished()) return;
        ctx.setMessage(first.done ? {} : first.value);
      }
      if (finished()) return;
      await callOperation(ctx, opId);
      if (finished()) return;
      if (ctx.getExtension("operationStreaming")) {
        stream.end(GrpcStatus.OK);
      } else {
        stream.sendUnary(this.unaryResponse(ctx.getOutput()));
      }
    } catch (err: any) {
      if (finished()) return;
      if (err instanceof WebdaError.OperationCancelledError) {
        // Raised by the operation itself while the client is still there
        stream.sendError(GrpcStatus.CANCELLED, err.message || "Operation cancelled");
        return;
      }
      if (!(err?.getResponseCode?.() < 500)) useLog("ERROR", `[gRPC ${opId}] handler threw:`, err);
      // Only client errors (4xx) carry their message: anything else may leak internals
      const code = err?.getResponseCode?.();
      const visible = typeof code === "number" && code >= 400 && code < 500;
      stream.sendError(this.errorToGrpcStatus(err), visible ? err.message || "Bad request" : "Internal server error");
    }
  }

  /**
   * Proto3 `optional` fields deserialize with an extra `_field: "field"` marker (synthetic oneof tracking): drop
   * those so the payload matches the backing JSON schema
   * @param message - decoded message
   * @returns the message without markers
   */
  private cleanMessage(message: unknown): unknown {
    return typeof message === "object" && message !== null && !Array.isArray(message)
      ? Object.fromEntries(Object.entries(message).filter(([key]) => !key.startsWith("_")))
      : message;
  }

  /**
   * The unary response for an operation output (a plain string/number is wrapped as `{ value }`)
   * @param output - the context output
   * @returns the response message
   */
  private unaryResponse(output: string | undefined): Record<string, unknown> {
    if (output === undefined || output === null || output === "") return {};
    try {
      return toGrpcMessage(JSON.parse(output));
    } catch {
      return { value: output };
    }
  }

  /**
   * Map a Webda error to a gRPC status code.
   * @param err - the error thrown by a Webda operation, expected to have a getResponseCode method
   * @returns the corresponding gRPC status code integer
   */
  private errorToGrpcStatus(err: any): number {
    const code = err?.getResponseCode?.();
    switch (code) {
      case 400:
        return GrpcStatus.INVALID_ARGUMENT;
      case 401:
        return GrpcStatus.UNAUTHENTICATED;
      case 403:
        return GrpcStatus.PERMISSION_DENIED;
      case 404:
        return GrpcStatus.NOT_FOUND;
      case 409:
        return GrpcStatus.ALREADY_EXISTS;
      case 429:
        return GrpcStatus.RESOURCE_EXHAUSTED;
      default:
        return GrpcStatus.INTERNAL;
    }
  }

  /**
   * No-op — gRPC operations are exposed via the proto definition, not individual routes.
   * @param _operationId - the operation ID (unused; routing is handled by the proto definition)
   * @param _definition - the operation definition (unused)
   * @returns void
   */
  exposeOperation(_operationId: string, _definition: OperationDefinition): void {
    // gRPC doesn't register routes individually — handled by proto definition
  }
}
