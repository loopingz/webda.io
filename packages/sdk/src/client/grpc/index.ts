/**
 * `@webda/sdk/client/grpc`: the gRPC transport, for Node, React Native, Electron and service-to-service use
 *
 * Not for browsers: `GrpcService` serves `application/grpc` over h2c, which browsers cannot speak.
 */
import type * as GrpcJs from "@grpc/grpc-js";
import type * as ProtoLoader from "@grpc/proto-loader";
import { SdkError } from "../errors.js";
import type { BidiStream, CallContext, OperationDescriptor, Transport } from "../types.js";

/** Options of the gRPC transport */
export interface GrpcTransportOptions {
  /** Address of the h2c server of `GrpcService` (`127.0.0.1:18080`) */
  address: string;
  /** The `.proto` file `GrpcService` generated (`webdac build`, its `protoFile` parameter) */
  protoFile: string;
  /** Protobuf package (`GrpcService` `packageName`, `manifest.transports.grpc.package`) @default "webda" */
  package?: string;
  /** Folders the imports of the proto are resolved from */
  includeDirs?: string[];
  /** Channel credentials @default grpc.credentials.createInsecure() */
  credentials?: GrpcJs.ChannelCredentials;
  /** Channel options of `@grpc/grpc-js` */
  channelOptions?: GrpcJs.ChannelOptions;
  /** Metadata per call, e.g. Authorization (the call `headers` are added) */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

/** gRPC status codes to HTTP-like statuses */
const STATUS_BY_GRPC: Record<number, number> = {
  1: 499, // CANCELLED
  2: 500, // UNKNOWN
  3: 400, // INVALID_ARGUMENT
  4: 504, // DEADLINE_EXCEEDED
  5: 404, // NOT_FOUND
  6: 409, // ALREADY_EXISTS
  7: 403, // PERMISSION_DENIED
  8: 429, // RESOURCE_EXHAUSTED
  9: 400, // FAILED_PRECONDITION
  10: 409, // ABORTED
  11: 400, // OUT_OF_RANGE
  12: 501, // UNIMPLEMENTED
  13: 500, // INTERNAL
  14: 0, // UNAVAILABLE: the server cannot be reached
  15: 500, // DATA_LOSS
  16: 401 // UNAUTHENTICATED
};

/** gRPC status names, used as the error code */
const STATUS_NAMES = [
  "OK",
  "CANCELLED",
  "UNKNOWN",
  "INVALID_ARGUMENT",
  "DEADLINE_EXCEEDED",
  "NOT_FOUND",
  "ALREADY_EXISTS",
  "PERMISSION_DENIED",
  "RESOURCE_EXHAUSTED",
  "FAILED_PRECONDITION",
  "ABORTED",
  "OUT_OF_RANGE",
  "UNIMPLEMENTED",
  "INTERNAL",
  "UNAVAILABLE",
  "DATA_LOSS",
  "UNAUTHENTICATED"
];

/**
 * @param err - a gRPC error (`ServiceError`: code, details)
 * @returns the SdkError
 */
export function grpcError(err: unknown): SdkError {
  if (err instanceof SdkError) return err;
  const { code, details, message } = (err ?? {}) as { code?: number; details?: string; message?: string };
  if (typeof code !== "number") {
    return new SdkError(0, message ?? "gRPC error", { transport: "grpc", cause: err });
  }
  return new SdkError(STATUS_BY_GRPC[code] ?? 500, details || message || STATUS_NAMES[code] || "gRPC error", {
    code: STATUS_NAMES[code] ?? String(code),
    transport: "grpc",
    cause: err
  });
}

/**
 * @param input - an operation input
 * @returns the request message: an object as it is, `{}` for nothing, `{ value }` for a scalar
 */
function messageOf(input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  return typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : { value: input };
}

/**
 * @param op - the operation
 * @param message - a response message
 * @returns the output: undefined for a `void` operation (`google.protobuf.Empty`)
 */
function outputOf(op: OperationDescriptor, message: unknown): unknown {
  return op.output === "void" && message && typeof message === "object" && !Object.keys(message).length
    ? undefined
    : message;
}

/**
 * A readable gRPC call as an async iterable, its errors mapped
 * @param call - the call
 * @returns the messages
 */
async function* messagesOf(call: NodeJS.ReadableStream & { cancel(): void }): AsyncGenerator<unknown> {
  let complete = false;
  try {
    for await (const message of call as AsyncIterable<unknown>) yield message;
    complete = true;
  } catch (err) {
    complete = true;
    throw grpcError(err);
  } finally {
    // The consumer left early: cancel the call
    if (!complete) call.cancel();
  }
}

/** What the transport loads on its first call */
interface Loaded {
  grpc: typeof GrpcJs;
  client: GrpcJs.Client;
  definition: ProtoLoader.PackageDefinition;
}

/**
 * Transport over `Webda/GrpcService`: the `.proto` it generated is loaded with `@grpc/proto-loader`, calls go through
 * `@grpc/grpc-js` (both optional peer dependencies, imported on the first call)
 *
 * Unary and server-streaming operations are reached through `call()` / `stream()`, client-streaming ones through
 * `call()` with an (async) iterable of messages as input, bidirectional ones through `connect()`.
 */
export class GrpcTransport implements Transport {
  readonly name = "grpc";
  protected loaded?: Promise<Loaded>;

  /**
   * @param options - transport options
   */
  constructor(protected options: GrpcTransportOptions) {}

  /**
   * @param op - the operation
   * @returns true when `GrpcService` serves it
   */
  supports(op: OperationDescriptor): boolean {
    return op.grpc !== undefined;
  }

  /**
   * Load the proto and open the channel, once
   * @returns grpc-js, the client and the definitions
   */
  protected load(): Promise<Loaded> {
    this.loaded ??= (async () => {
      let grpc: typeof GrpcJs;
      let loader: typeof ProtoLoader;
      try {
        [grpc, loader] = await Promise.all([import("@grpc/grpc-js"), import("@grpc/proto-loader")]);
      } catch (err) {
        throw new SdkError(0, `@grpc/grpc-js and @grpc/proto-loader are required by GrpcTransport: ${err}`, {
          transport: this.name,
          cause: err
        });
      }
      const definition = await loader.load(this.options.protoFile, {
        // Same field names as the JSON schemas, absent fields stay absent
        keepCase: true,
        longs: String,
        enums: String,
        defaults: false,
        oneofs: false,
        includeDirs: this.options.includeDirs
      });
      const client = new grpc.Client(
        this.options.address,
        this.options.credentials ?? grpc.credentials.createInsecure(),
        this.options.channelOptions
      );
      return { grpc, client, definition };
    })();
    this.loaded.catch(() => {
      // Retry the load on the next call
      this.loaded = undefined;
    });
    return this.loaded;
  }

  /**
   * @param op - the operation
   * @param ctx - the call context
   * @returns the method definition and the call metadata
   * @throws SdkError when the proto does not have the rpc
   */
  protected async prepare(
    op: OperationDescriptor,
    ctx: CallContext
  ): Promise<Loaded & { method: ProtoLoader.MethodDefinition<any, any>; metadata: GrpcJs.Metadata }> {
    const loaded = await this.load();
    const service = loaded.definition[`${this.options.package ?? "webda"}.${op.grpc!.service}`] as
      ProtoLoader.ServiceDefinition | undefined;
    const method = service?.[op.grpc!.rpc];
    if (!method) {
      throw new SdkError(
        501,
        `rpc ${op.grpc!.service}/${op.grpc!.rpc} of ${op.id} is not in ${this.options.protoFile}`,
        {
          code: "UNIMPLEMENTED",
          transport: this.name
        }
      );
    }
    const metadata = new loaded.grpc.Metadata();
    for (const [key, value] of Object.entries({ ...(await this.options.headers?.()), ...ctx.headers })) {
      metadata.set(key.toLowerCase(), value);
    }
    return { ...loaded, method, metadata };
  }

  /**
   * Unary call, or client streaming with an (async) iterable of messages as input; a server stream is collected
   * @param op - the operation
   * @param input - the input, the messages of a client stream
   * @param ctx - the call context
   * @returns the output
   */
  async call(op: OperationDescriptor, input: unknown, ctx: CallContext): Promise<unknown> {
    if (op.streaming === "server" || op.streaming === "bidi") {
      const chunks: unknown[] = [];
      if (op.streaming === "server") {
        for await (const chunk of this.stream(op, input, ctx)) chunks.push(chunk);
        return chunks;
      }
      const stream = this.connect(op, ctx);
      for await (const message of toIterable(input)) stream.send(message);
      stream.close();
      for await (const chunk of stream) chunks.push(chunk);
      return chunks;
    }
    const { client, method, metadata } = await this.prepare(op, ctx);
    return new Promise((resolve, reject) => {
      const callback = (err: GrpcJs.ServiceError | null, response?: unknown) =>
        err ? reject(grpcError(err)) : resolve(outputOf(op, response));
      if (op.streaming === "client") {
        const call = client.makeClientStreamRequest(
          method.path,
          method.requestSerialize,
          method.responseDeserialize,
          metadata,
          {},
          callback
        );
        ctx.signal?.addEventListener("abort", () => call.cancel());
        (async () => {
          for await (const message of toIterable(input)) call.write(messageOf(message));
          call.end();
        })().catch(err => {
          call.cancel();
          reject(grpcError(err));
        });
        return;
      }
      const call = client.makeUnaryRequest(
        method.path,
        method.requestSerialize,
        method.responseDeserialize,
        messageOf(input),
        metadata,
        {},
        callback
      );
      ctx.signal?.addEventListener("abort", () => call.cancel());
    });
  }

  /**
   * Server streaming
   * @param op - the operation
   * @param input - the input
   * @param ctx - the call context
   * @returns the messages
   */
  async *stream(op: OperationDescriptor, input: unknown, ctx: CallContext): AsyncIterable<unknown> {
    if (op.streaming !== "server") {
      yield await this.call(op, input, ctx);
      return;
    }
    const { client, method, metadata } = await this.prepare(op, ctx);
    const call = client.makeServerStreamRequest(
      method.path,
      method.requestSerialize,
      method.responseDeserialize,
      messageOf(input),
      metadata,
      {}
    );
    ctx.signal?.addEventListener("abort", () => call.cancel());
    yield* messagesOf(call);
  }

  /**
   * Bidirectional streaming
   * @param op - the operation
   * @param ctx - the call context
   * @returns the stream: messages sent before the channel is ready are queued
   */
  connect(op: OperationDescriptor, ctx: CallContext): BidiStream {
    const prepared = this.prepare(op, ctx).then(({ client, method, metadata }) => {
      const call = client.makeBidiStreamRequest(
        method.path,
        method.requestSerialize,
        method.responseDeserialize,
        metadata,
        {}
      );
      ctx.signal?.addEventListener("abort", () => call.cancel());
      return call;
    });
    let resolveClosed!: () => void;
    let rejectClosed!: (err: Error) => void;
    const closed = new Promise<void>((resolve, reject) => {
      resolveClosed = resolve;
      rejectClosed = reject;
    });
    closed.catch(() => {});
    prepared.then(
      call => {
        call.on("status", (status: GrpcJs.StatusObject) => {
          if (status.code === 0) resolveClosed();
          else rejectClosed(grpcError({ code: status.code, details: status.details }));
        });
        call.on("error", () => {
          // Reported by the status and the iteration
        });
      },
      err => rejectClosed(err)
    );
    // Writes keep their order once the call is ready
    let writes: Promise<unknown> = prepared;
    const enqueue = (write: (call: GrpcJs.ClientDuplexStream<any, any>) => void) => {
      writes = writes.then(() => prepared).then(write);
      writes.catch(() => {});
    };
    return {
      closed,
      send: message => enqueue(call => call.write(messageOf(message))),
      close: () => enqueue(call => call.end()),
      [Symbol.asyncIterator]: () =>
        (async function* incoming() {
          yield* messagesOf(await prepared);
        })()
    };
  }

  /**
   * Close the channel
   */
  async close(): Promise<void> {
    const loaded = this.loaded;
    this.loaded = undefined;
    if (loaded) (await loaded.catch(() => undefined))?.client.close();
  }
}

/**
 * @param input - messages: an async iterable, an iterable, or one message
 * @returns them as an async iterable
 */
async function* toIterable(input: unknown): AsyncGenerator<unknown> {
  if (input && typeof input === "object" && Symbol.asyncIterator in input) {
    yield* input as AsyncIterable<unknown>;
  } else if (Array.isArray(input) || (input && typeof input === "object" && Symbol.iterator in input)) {
    yield* input as Iterable<unknown>;
  } else if (input !== undefined) {
    yield input;
  }
}
