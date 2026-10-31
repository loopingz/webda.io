import { EntityCache, type CacheOptions } from "./cache.js";
import { Emitter } from "./emitter.js";
import { SdkError } from "./errors.js";
import { HttpTransport, type HttpTransportOptions } from "./http.js";
import { traceHeaders, type WebTracingState } from "./tracing.js";
import type { ModelBackend, ModelClient } from "./model-client.js";
import type { SdkModel } from "./model.js";
import {
  MUTATION_KINDS,
  type BidiStream,
  type CallOptions,
  type ChangeEvent,
  type ModelDescriptor,
  type ModelsManifest,
  type OperationDescriptor,
  type OperationSignature,
  type OperationsManifest,
  type OperationsMap,
  type ServerManifest,
  type Transport
} from "./types.js";

/**
 * Serves some models from a local replica: `offline()` of `@webda/sdk/client/offline` (extension point)
 */
export interface OfflineExtension {
  /**
   * Called once by the client it is given to, before the model clients are created
   * @param client - the client
   */
  attach(client: WebdaClient<any>): void;
  /**
   * @param descriptor - a model
   * @returns the backend of the model, undefined to keep the transports (`RemoteBackend`)
   */
  backend(descriptor: ModelDescriptor): ModelBackend | undefined;
}

/** Options of `createClient()` */
export interface ClientOptions extends Partial<Omit<HttpTransportOptions, "baseUrl">> {
  /** Base URL of the REST API; required unless `transports` is given */
  baseUrl?: string;
  /**
   * Ordered transports; the first whose `supports(op)` is true carries the call
   * @default [new HttpTransport({ baseUrl, ... })]
   */
  transports?: Transport[];
  /** Cache policy, or a cache shared between clients */
  cache?: CacheOptions | EntityCache;
  /** Serve the models synced by the application's `SyncService` offline-first: `offline({ storage })` */
  offline?: OfflineExtension;
}

/**
 * The client of a Webda application: typed operation calls, transports, cache and model clients
 *
 * The generated `createClient()` instantiates it with the operations and models of the application.
 */
export class WebdaClient<Ops extends OperationsMap<Ops> = Record<string, OperationSignature>> extends Emitter<{
  change: ChangeEvent;
}> {
  readonly operations: OperationsManifest;
  readonly models: ModelsManifest;
  readonly cache: EntityCache;
  readonly transports: Transport[];
  /** What the application serves: its transports and its `SyncService` */
  readonly server: ServerManifest;
  /** The offline extension, when configured */
  readonly offline?: OfflineExtension;
  protected webTracing?: WebTracingState;
  protected readonly modelClients = new Map<string, ModelClient<any>>();

  /**
   * @param options - client options with the manifests
   */
  constructor(
    options: ClientOptions & { operations: OperationsManifest; models?: ModelsManifest; server?: ServerManifest }
  ) {
    super();
    this.operations = options.operations;
    this.models = options.models ?? {};
    this.server = options.server ?? { transports: {} };
    this.cache = options.cache instanceof EntityCache ? options.cache : new EntityCache(options.cache);
    this.cache.on("change", event => this.emit("change", event));
    const { transports, cache, operations, models, server, offline, baseUrl, ...http } = options;
    void cache;
    void operations;
    void models;
    void server;
    this.transports = transports ?? [new HttpTransport({ baseUrl: baseUrl ?? "/", ...http })];
    if (offline) {
      this.offline = offline;
      offline.attach(this);
    }
  }

  /**
   * @param descriptor - a model
   * @returns where its objects live: the offline replica for a synced model when `offline` is configured, else the
   * transports
   */
  backendFor(descriptor: ModelDescriptor): ModelBackend | undefined {
    return this.offline?.backend(descriptor);
  }

  /**
   * @param id - operation id
   * @returns its descriptor
   * @throws SdkError when the operation is unknown
   */
  operation(id: string): OperationDescriptor {
    const op = this.operations[id];
    if (!op) throw new SdkError(0, `Operation ${id} is unknown`);
    return op;
  }

  /**
   * @param op - the operation
   * @param feature - what the transport must do
   * @returns the first transport carrying the operation
   * @throws SdkError when none does
   */
  transportFor(op: OperationDescriptor, feature: "call" | "stream" | "connect" = "call"): Transport {
    const transport = this.transports.find(t => t.supports(op) && (feature === "call" || t[feature] !== undefined));
    if (!transport) {
      const names = this.transports.map(t => t.name).join(", ") || "none";
      const hint =
        op.streaming === "client"
          ? ": it takes a client stream, which needs a transport with client streaming (gRPC)"
          : op.streaming === "bidi" && feature !== "connect"
            ? ": it is bidirectional, use connect()"
            : "";
      throw new SdkError(0, `Operation ${op.id} is not exposed on the configured transports (${names})${hint}`);
    }
    return transport;
  }

  /**
   * Call an operation
   * @param id - operation id
   * @param input - the input
   * @param options - call options
   * @returns the output
   */
  async call<K extends keyof Ops & string>(
    id: K,
    input?: Ops[K]["input"],
    options: CallOptions = {}
  ): Promise<Ops[K]["output"]> {
    const op = this.operation(id);
    if (op.streaming === "bidi") {
      throw new SdkError(0, `Operation ${id} is bidirectional, use connect()`);
    }
    const result = await this.transportFor(op).call(op, input, this.withTrace(options));
    this.invalidateAfter(op);
    return result as Ops[K]["output"];
  }

  /**
   * Consume a server-streaming operation
   * @param id - operation id
   * @param input - the input
   * @param options - call options
   * @returns the chunks
   */
  stream<K extends keyof Ops & string>(
    id: K,
    input?: Ops[K]["input"],
    options: CallOptions = {}
  ): AsyncIterable<Ops[K]["output"]> {
    const op = this.operation(id);
    return this.transportFor(op, "stream").stream!(op, input, this.withTrace(options)) as AsyncIterable<
      Ops[K]["output"]
    >;
  }

  /**
   * Open a bidirectional operation
   * @param id - operation id
   * @param options - call options
   * @returns the stream
   */
  connect<K extends keyof Ops & string>(
    id: K,
    options: CallOptions = {}
  ): BidiStream<Ops[K]["input"], Ops[K]["output"]> {
    const op = this.operation(id);
    return this.transportFor(op, "connect").connect!(op, this.withTrace(options)) as BidiStream<
      Ops[K]["input"],
      Ops[K]["output"]
    >;
  }

  /**
   * Ask the server to trace this client: while enabled, every call carries the trace headers
   * @param sessionId - session id to correlate the traces, generated by the server when omitted
   * @param options - `operationId` of the enabling operation, `activeSpanContext` to join the trace of the current span
   * @returns the session id and the expiry (epoch ms)
   */
  async enableWebTracing(
    sessionId?: string,
    options: {
      operationId?: string;
      activeSpanContext?: () => { traceId: string; spanId: string } | undefined;
    } = {}
  ): Promise<{ sessionId: string; expiresAt: number }> {
    this.webTracing = undefined;
    const res = (await (this as WebdaClient<any>).call(
      options.operationId ?? "Otel.EnableWebTracing",
      sessionId ? { sessionId } : {}
    )) as { token: string; sessionId: string; expiresAt: number };
    this.webTracing = {
      token: res.token,
      sessionId: res.sessionId,
      expiresAt: res.expiresAt,
      activeSpanContext: options.activeSpanContext
    };
    return { sessionId: res.sessionId, expiresAt: res.expiresAt };
  }

  /** Stop sending the trace headers and forget the token */
  disableWebTracing(): void {
    this.webTracing = undefined;
  }

  /**
   * @returns true while web tracing is enabled and not expired
   */
  isWebTracing(): boolean {
    return this.webTracing !== undefined && Date.now() < this.webTracing.expiresAt;
  }

  /**
   * The single merge point of the trace headers: every transport call goes through it
   * @param options - call options
   * @returns the options with the trace headers, those of the caller win
   */
  protected withTrace(options: CallOptions): CallOptions {
    const headers = traceHeaders(this.webTracing);
    return Object.keys(headers).length ? { ...options, headers: { ...headers, ...options.headers } } : options;
  }

  /**
   * Forget the cached queries a mutation made stale: the model's and its ancestors', or the models a service
   * operation tags
   * @param op - the operation that succeeded
   */
  protected invalidateAfter(op: OperationDescriptor): void {
    const models: string[] = [];
    if (op.model && op.kind && MUTATION_KINDS.has(op.kind)) {
      models.push(op.model, ...(this.models[op.model]?.ancestors ?? []));
    } else if (op.kind === "service" || !op.model) {
      models.push(...(op.tags ?? []).filter(tag => this.models[tag] !== undefined));
    }
    if (models.length) this.cache.invalidate(...new Set(models));
  }

  /**
   * @param client - the client of a model
   * @returns this
   */
  registerModel(client: ModelClient<any>): this {
    this.modelClients.set(client.id, client);
    return this;
  }

  /**
   * @param id - model id
   * @returns the client of the model
   * @throws SdkError when the model is unknown
   */
  model<T extends SdkModel = SdkModel>(id: string): ModelClient<T> {
    const client = this.modelClients.get(id);
    if (!client) throw new SdkError(0, `Model ${id} is not registered on the client`);
    return client;
  }

  /**
   * @param id - model id
   * @returns the model descriptor
   * @throws SdkError when the model is unknown
   */
  descriptor(id: string): ModelDescriptor {
    const descriptor = this.models[id];
    if (!descriptor) throw new SdkError(0, `Model ${id} is unknown`);
    return descriptor;
  }

  /**
   * The parent chain of a nested object, root first, from the data or the cached objects
   * @param model - model id
   * @param uid - the object's uid
   * @param data - the object's data when known
   * @returns the parents' uids, undefined when the chain cannot be completed
   */
  resolveParents(model: string, uid?: string, data?: Record<string, unknown>): string[] | undefined {
    const descriptor = this.models[model];
    if (!descriptor?.parent) return [];
    const parent =
      data?.[descriptor.parent.attribute] ?? this.cache.getEntity(model, uid ?? "")?.data[descriptor.parent.attribute];
    if (parent === undefined || parent === null || parent === "") return undefined;
    const above = this.resolveParents(descriptor.parent.model, String(parent));
    return above ? [...above, String(parent)] : undefined;
  }
}
