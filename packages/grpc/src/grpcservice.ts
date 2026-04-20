import {
  OperationsTransport,
  OperationsTransportParameters,
  OperationDefinition,
  callOperation,
  OperationContext,
  SimpleOperationContext,
  WebContext,
  useApplication,
  useCore,
  Command,
  ServiceParameters,
  runWithInstanceStorage,
  useInstanceStorage
} from "@webda/core";
import { useLog } from "@webda/workout";
import * as protoLoader from "@grpc/proto-loader";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
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
   * Load and apply default parameter values.
   * @param params - raw configuration object to load into this parameters instance
   * @returns this instance with defaults applied
   */
  load(params: any = {}): this {
    super.load(params);
    this.protoFile ??= ".webda/app.proto";
    this.packageName ??= "webda";
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
 * Use the `generate-proto` command to create the .proto file from operations.
 *
 * @WebdaModda
 */
export class GrpcService<
  T extends GrpcServiceParameters = GrpcServiceParameters
> extends OperationsTransport<T> {
  /** Loaded protobuf definitions */
  private definitions: protoLoader.PackageDefinition;
  /** Map of gRPC path → operation ID */
  private rpcToOperation: Map<string, string> = new Map();
  /** Map of gRPC path → method definition */
  private rpcMethods: Map<string, protoLoader.MethodDefinition<any, any>> = new Map();

  /**
   * Generate a .proto file from the current operation registry.
   *
   * @param output - output file path (defaults to parameters.protoFile)
   * @returns a promise that resolves when the proto file has been written to disk
   */
  @Command("generate-proto", { description: "Generate protobuf definition from operations", requires: ["rest-domain"] })
  async generateProto(
    /** @alias o @description Output file path */
    output?: string
  ): Promise<void> {
    const outPath = output || this.parameters.protoFile;
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
   * Initialize the gRPC transport: load proto, build RPC map, hook into HTTP/2.
   * @returns a promise resolving to this service instance once initialization is complete
   */
  async init(): Promise<this> {
    await super.init();

    // Load proto file if it exists
    if (existsSync(this.parameters.protoFile)) {
      try {
        this.definitions = protoLoader.loadSync(this.parameters.protoFile, {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true
        });
        this.buildRpcMap();
        useLog(
          "INFO",
          `Loaded gRPC definitions from ${this.parameters.protoFile} — ${this.rpcToOperation.size} RPC methods mapped`
        );
      } catch (err: any) {
        useLog("WARN", `Failed to load proto file: ${err.message}`);
      }
    } else {
      useLog(
        "WARN",
        `Proto file not found: ${this.parameters.protoFile}. Run 'webda generate-proto' first.`
      );
    }

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
   * Handle an incoming gRPC request.
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
    const operation = this.getOperations()[opId];
    const grpc = operation?.grpc;
    const streaming = (typeof grpc === "object" && grpc ? grpc.streaming : undefined) || "none";

    try {
      if (streaming === "bidi" || streaming === "client") {
        // Client/bidi streaming — collect messages and process
        await this.handleStreamingRequest(stream, opId, streaming);
      } else if (streaming === "server") {
        // Server streaming — single request, stream responses
        await this.handleServerStreaming(stream, opId, methodDef);
      } else {
        // Unary — single request, single response
        await this.handleUnary(stream, opId, methodDef);
      }
    } catch (err) {
      const status = this.errorToGrpcStatus(err);
      stream.sendError(status, err.message || "Internal error");
    }
  }

  /**
   * Handle a unary gRPC call (single request → single response).
   * @param stream - the active GrpcStream for this request
   * @param opId - the Webda operation ID to invoke
   * @param methodDef - the protobuf method definition with serializer functions
   * @returns a promise that resolves when the unary response has been sent
   */
  private handleUnary(
    stream: GrpcStream,
    opId: string,
    methodDef: protoLoader.MethodDefinition<any, any>
  ): Promise<void> {
    // AsyncLocalStorage doesn't always propagate through the HTTP/2 'data'
    // event that drives GrpcStream.onMessage, so capture the storage here and
    // re-enter it inside the callback.
    const instanceStorage = useInstanceStorage();
    return new Promise<void>((resolve, reject) => {
      stream.onMessage(message => {
        runWithInstanceStorage(instanceStorage, async () => {
          try {
            const ctx = new SimpleOperationContext();
            await ctx.init();
            // Proto3 `optional` fields deserialize with an extra `_field: "field"`
            // marker (synthetic oneof tracking). Drop those so the payload matches
            // the backing JSON schema which forbids additional properties.
            const cleaned =
              typeof message === "object" && message !== null && !Array.isArray(message)
                ? Object.fromEntries(Object.entries(message).filter(([k]) => !k.startsWith("_")))
                : message;
            ctx.setInput(Buffer.from(JSON.stringify(cleaned)));
            await callOperation(ctx, opId);
            const output = ctx.getOutput();
            // Operation return values may be plain strings/numbers (e.g. version
            // strings, publish ids). Wrap them in a `{value: ...}` object so the
            // proto response is always a valid message shape.
            let response: any = {};
            if (output !== undefined && output !== null && output !== "") {
              try {
                response = JSON.parse(output);
                if (typeof response !== "object" || response === null) {
                  response = { value: response };
                }
              } catch {
                response = { value: output };
              }
            }
            stream.sendUnary(response);
            resolve();
          } catch (err: any) {
            useLog("ERROR", `[gRPC ${opId}] handler threw:`, err);
            const status = this.errorToGrpcStatus(err);
            stream.sendError(status, err.message);
            resolve(); // Don't reject — error was sent via gRPC status
          }
        });
      });
    });
  }

  /**
   * Handle server streaming (single request → stream of responses).
   * Maps to AsyncGenerator operations.
   * @param stream - the active GrpcStream for this request
   * @param opId - the Webda operation ID to invoke
   * @param methodDef - the protobuf method definition with serializer functions
   * @returns a promise that resolves when all response frames have been sent
   */
  private handleServerStreaming(
    stream: GrpcStream,
    opId: string,
    methodDef: protoLoader.MethodDefinition<any, any>
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      stream.onMessage(async message => {
        try {
          const ctx = new SimpleOperationContext();
          await ctx.init();
          ctx.setInput(Buffer.from(JSON.stringify(message)));
          await callOperation(ctx, opId);
          // callOperation writes chunks to ctx for AsyncGenerators
          // For now, send the full output as a single response
          const output = ctx.getOutput();
          if (output) {
            // Try to parse as NDJSON (multiple JSON objects)
            const lines = output.split("\n").filter(Boolean);
            for (const line of lines) {
              try {
                stream.send(JSON.parse(line));
              } catch {
                stream.send({ data: line });
              }
            }
          }
          stream.end(GrpcStatus.OK);
          resolve();
        } catch (err: any) {
          const status = this.errorToGrpcStatus(err);
          stream.sendError(status, err.message);
          resolve();
        }
      });
    });
  }

  /**
   * Handle client or bidirectional streaming.
   * @param stream - the active GrpcStream for this request
   * @param opId - the Webda operation ID to invoke
   * @param streaming - streaming mode, either "client" or "bidi"
   * @returns a promise that resolves when the operation completes and the response is sent
   */
  private handleStreamingRequest(
    stream: GrpcStream,
    opId: string,
    streaming: string
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const messages: any[] = [];

      stream.onMessage(message => {
        messages.push(message);
      });

      stream.onEnd(async () => {
        try {
          // For client streaming: process all collected messages
          const ctx = new SimpleOperationContext();
          await ctx.init();
          ctx.setInput(Buffer.from(JSON.stringify(messages)));
          await callOperation(ctx, opId);
          const output = ctx.getOutput();
          const response = output ? JSON.parse(output) : {};

          if (streaming === "bidi") {
            // Bidi: send response for each input message
            stream.send(response);
          } else {
            // Client streaming: single response
            stream.sendUnary(response);
          }
          resolve();
        } catch (err: any) {
          const status = this.errorToGrpcStatus(err);
          stream.sendError(status, err.message);
          resolve();
        }
      });

      stream.onCancel(() => {
        resolve();
      });
    });
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
