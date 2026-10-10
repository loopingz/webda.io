import {
  AsyncQueue,
  HttpContext,
  type OperationDefinition,
  Session,
  WebContext,
  WebdaError,
  getOperationStreaming
} from "@webda/core";
import { JSONUtils } from "@webda/utils";
import { operationError } from "./mutations.js";

/** Operations the model schema already serves (X, Xs, createX, updateX, deleteX) */
export const CRUD_METHODS = new Set([
  "modelCreate",
  "modelUpdate",
  "modelPatch",
  "modelDelete",
  "modelGet",
  "modelQuery"
]);

/** A valid GraphQL name */
export const GRAPHQL_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;

/** Streamed chunks waiting for the subscriber above which the operation waits */
const HIGH_WATER = 16;

/**
 * @param id - operation id
 * @returns its PascalCase name without dots (`TaskService.Summary` → `TaskServiceSummary`)
 */
export function operationTypeName(id: string): string {
  return id
    .split(".")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * @param id - operation id
 * @returns its GraphQL field name (`TaskService.Summary` → `taskServiceSummary`)
 */
export function operationFieldName(id: string): string {
  const name = operationTypeName(id);
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * @param op - operation
 * @returns true when it only reads (REST GET, or MCP readOnly)
 */
export function isReadOnlyOperation(op: OperationDefinition): boolean {
  return (
    (typeof op.rest === "object" && op.rest?.method?.toLowerCase() === "get") ||
    (typeof op.mcp === "object" && op.mcp?.readOnly === true)
  );
}

/** Where an operation goes in the GraphQL schema */
export type GraphQLPlacement = { kind: "query" | "mutation" | "subscription"; name: string };

/**
 * Where an operation is exposed in GraphQL
 * @param id - operation id
 * @param op - operation
 * @returns its placement, undefined when GraphQL does not expose it
 * @throws Error when an explicit placement does not match the streaming mode
 */
export function graphqlPlacement(id: string, op: OperationDefinition): GraphQLPlacement | undefined {
  if (op.hidden || op.graphql === false || CRUD_METHODS.has(op.method)) {
    return undefined;
  }
  const streaming = getOperationStreaming(op);
  if (streaming === "client" || streaming === "bidi") {
    return undefined;
  }
  const explicit = typeof op.graphql === "object" ? op.graphql : undefined;
  const forced: GraphQLPlacement | undefined = explicit?.subscription
    ? { kind: "subscription", name: explicit.subscription }
    : explicit?.query
      ? { kind: "query", name: explicit.query }
      : explicit?.mutation
        ? { kind: "mutation", name: explicit.mutation }
        : undefined;
  if (forced && (forced.kind === "subscription") !== (streaming === "server")) {
    throw new Error(
      `Operation ${id}: graphql.${forced.kind} does not match its streaming mode (${streaming}); a server-streaming operation is a subscription, the others a query or a mutation`
    );
  }
  if (forced) {
    return forced;
  }
  if (streaming === "server") {
    return { kind: "subscription", name: operationFieldName(id) };
  }
  return { kind: isReadOnlyOperation(op) ? "query" : "mutation", name: operationFieldName(id) };
}

/**
 * A value as clients may see it: plain JSON without `__` keys
 * @param value - an operation result or chunk
 * @returns the copy (null for undefined)
 */
export function publicCopy(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSONUtils.stringify(value, undefined, 0, true));
}

/**
 * The context of an operation called from GraphQL: the GraphQL request's session and headers, the field arguments as
 * input; a non-streamed result is kept as is (`result`), streamed chunks are queued for the subscription.
 */
export class GraphQLOperationContext extends WebContext {
  /** Last value written by a non-streamed operation */
  result: unknown;
  private readonly message: Buffer;
  private readonly queue = new AsyncQueue<unknown>();
  private pending = 0;
  private wakers: (() => void)[] = [];
  private cancelled = false;
  private finished = false;
  private failure?: unknown;

  /**
   * @param parent - the GraphQL request context
   * @param input - the operation input (from the field arguments)
   * @param transform - turns a streamed chunk into what the subscriber receives
   */
  constructor(
    parent: WebContext,
    input: unknown,
    private readonly transform: (chunk: unknown) => unknown = publicCopy
  ) {
    super(parent.getHttpContext?.() ?? new HttpContext("localhost", "POST", "/graphql"));
    this.setSession(parent.getSession() ?? new Session());
    this.message = Buffer.from(input === undefined ? "" : JSON.stringify(input));
  }

  /**
   * The session comes from the GraphQL request, already loaded
   * @override
   */
  async init(_force: boolean = false): Promise<this> {
    return this;
  }

  /**
   * @override
   */
  async getRawInput(limit: number = 10 * 1024 * 1024, _timeout: number = 60000): Promise<Buffer> {
    return this.message.subarray(0, limit);
  }

  /**
   * @override
   */
  async getRawInputAsString(
    limit: number = 10 * 1024 * 1024,
    _timeout: number = 60000,
    encoding?: string
  ): Promise<string> {
    return this.message.subarray(0, limit).toString((encoding as BufferEncoding) || "utf8");
  }

  /**
   * @returns whether the subscriber left
   */
  get isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Streamed chunks are queued for the subscriber; a non-streamed result is kept
   * @override
   * @throws OperationCancelledError when the subscriber left or the stream is over
   */
  // @ts-ignore same signature as WebContext.write
  public write(output: any, _encoding?: string, _cb?: (error: Error) => void): boolean {
    if (!this.getExtension("operationStreaming")) {
      this.result = output;
      return true;
    }
    if (this.cancelled || this.finished) throw new WebdaError.OperationCancelledError();
    this.queue.push(this.transform(output));
    this.pending++;
    return this.pending < HIGH_WATER;
  }

  /**
   * Wait for the subscriber to consume the queued chunks
   * @override
   * @throws OperationCancelledError when the subscriber left
   */
  async drained(): Promise<void> {
    while (!this.cancelled && this.pending >= HIGH_WATER) {
      await new Promise<void>(resolve => this.wakers.push(resolve));
    }
    if (this.cancelled) throw new WebdaError.OperationCancelledError();
  }

  /** The subscriber left: the next write or drain throws, the iterator ends. */
  cancel(): void {
    this.cancelled = true;
    this.queue.end(true);
    this.wake();
  }

  /** The operation completed. */
  finish(): void {
    this.finished = true;
    this.queue.end();
  }

  /**
   * The operation failed: the subscriber gets the error after the chunks already queued, unless it already left
   * @param error - what the operation threw (mapped like a query error: unexpected ones are hidden)
   */
  fail(error: unknown): void {
    this.finished = true;
    if (this.cancelled && error instanceof WebdaError.OperationCancelledError) {
      // The expected end of an operation whose subscriber left
      this.queue.end();
      return;
    }
    // Any other error is mapped (and logged when unexpected) even if nobody listens anymore
    const mapped = operationError(error);
    if (!this.cancelled) {
      this.failure = mapped;
    }
    this.queue.end();
  }

  /**
   * @returns the chunks, for a subscription field (return() cancels the operation)
   */
  chunks(): AsyncIterableIterator<unknown> {
    const iterator: AsyncIterableIterator<unknown> = {
      next: async () => {
        const item = await this.queue.next();
        if (item.done) {
          if (this.failure !== undefined) {
            const failure = this.failure;
            this.failure = undefined;
            throw failure;
          }
          return item;
        }
        this.pending--;
        this.wake();
        return item;
      },
      return: async () => {
        this.cancel();
        return { value: undefined, done: true };
      },
      [Symbol.asyncIterator]: () => iterator
    };
    return iterator;
  }

  /** Lets a waiting drained() check again */
  private wake(): void {
    for (const waker of this.wakers.splice(0)) waker();
  }
}
