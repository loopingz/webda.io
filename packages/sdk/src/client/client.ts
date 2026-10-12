import { EntityCache, type CacheOptions } from "./cache.js";
import { Emitter } from "./emitter.js";
import { SdkError } from "./errors.js";
import { HttpTransport, type HttpTransportOptions } from "./http.js";
import type { ModelClient } from "./model-client.js";
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
  type Transport
} from "./types.js";

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
  protected readonly modelClients = new Map<string, ModelClient<any>>();

  /**
   * @param options - client options with the manifests
   */
  constructor(options: ClientOptions & { operations: OperationsManifest; models?: ModelsManifest }) {
    super();
    this.operations = options.operations;
    this.models = options.models ?? {};
    this.cache = options.cache instanceof EntityCache ? options.cache : new EntityCache(options.cache);
    this.cache.on("change", event => this.emit("change", event));
    const { transports, cache, operations, models, baseUrl, ...http } = options;
    void cache;
    void operations;
    void models;
    this.transports = transports ?? [new HttpTransport({ baseUrl: baseUrl ?? "/", ...http })];
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
    const result = await this.transportFor(op).call(op, input, options);
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
    return this.transportFor(op, "stream").stream!(op, input, options) as AsyncIterable<Ops[K]["output"]>;
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
    return this.transportFor(op, "connect").connect!(op, options) as BidiStream<Ops[K]["input"], Ops[K]["output"]>;
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
