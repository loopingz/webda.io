import { createHash } from "node:crypto";
import { OperationsTransport, OperationsTransportParameters } from "../services/operationstransport.js";
import { canCallOperation, getOperationStreaming, listOperations } from "../core/operations.js";
import { useApplication } from "../application/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import * as WebdaError from "../errors/errors.js";
import type { WebContext } from "../contexts/webcontext.js";
import { runOperation } from "./streaming.js";

/** Parameters of the operation-id transport */
export class OperationIdTransportParameters extends OperationsTransportParameters {
  /**
   * Route prefix
   * @default "/operations"
   */
  url: string;
  /**
   * Keep-alive interval of a streamed response, in ms
   * @default 20000
   */
  streamKeepAliveInterval?: number;

  /** @override */
  load(params: any = {}): this {
    super.load(params);
    this.url ??= "/operations";
    this.streamKeepAliveInterval ??= 20000;
    return this;
  }
}

/**
 * Generic operation transport for clients that work by operation id (Webda CLI): list the callable operations, call one
 *
 * @WebdaModda OperationsTransport
 */
export class OperationIdTransport<
  T extends OperationIdTransportParameters = OperationIdTransportParameters
> extends OperationsTransport<T> {
  /**
   * Whether this transport serves an operation: known, visible, included by the `operations` filter and not client-streamed
   * @param id - the operation identifier
   * @returns true when it can be listed and called
   */
  protected isServed(id: string): boolean {
    const operations = useInstanceStorage().operations;
    if (!Object.hasOwn(operations, id)) return false;
    const op = operations[id];
    return !op.hidden && this.parameters.isIncluded(id) && !["client", "bidi"].includes(getOperationStreaming(op));
  }

  /** @override Routes are fixed, operations are not exposed one by one */
  protected initTransport(): void {
    // Nothing to expose per operation
  }

  /** @override */
  exposeOperation(): void {
    // Nothing to expose per operation
  }

  /** @override */
  resolve(): this {
    super.resolve();
    this.addRoute(this.parameters.url, ["GET"], this.list, { hidden: true });
    this.addRoute(`${this.parameters.url}/{id}`, ["POST"], this.call, { hidden: true });
    return this;
  }

  /**
   * List the operations the caller (and its token scope) may call: `{ version, operations }`. `version` is a hash of
   * the listed operations (16 hex characters): it changes whenever an operation the caller sees is added, removed or
   * changed, so a client can cache the listing
   * @param ctx - web context
   */
  async list(ctx: WebContext): Promise<void> {
    const app = useApplication();
    const operations: Record<string, any> = {};
    for (const [id, op] of Object.entries(listOperations())) {
      if (!this.isServed(id) || !(await canCallOperation(ctx, id))) continue;
      const streaming = getOperationStreaming(op);
      operations[id] = {
        id,
        summary: op.summary,
        description: op.description,
        input: op.input && op.input !== "void" ? app.getSchema(op.input) : undefined,
        output: op.output && op.output !== "void" ? app.getSchema(op.output) : undefined,
        destructive: typeof op.mcp === "object" ? op.mcp.destructive : undefined,
        streaming: streaming !== "none" ? streaming : undefined
      };
    }
    const version = createHash("sha256").update(JSON.stringify(operations)).digest("hex").slice(0, 16);
    ctx.setHeader("Content-Type", "application/json");
    ctx.write({ version, operations });
  }

  /**
   * Call an operation by id
   * @param ctx - web context
   */
  async call(ctx: WebContext): Promise<void> {
    const id = ctx.getParameters().id;
    if (!this.isServed(id)) {
      throw new WebdaError.NotFound(`${id} Unknown`);
    }
    // The route parameter is the operation id, not an input of the operation
    const { id: _id, ...parameters } = ctx.getParameters();
    ctx.setParameters(parameters);
    await runOperation(ctx, id, this.parameters.streamKeepAliveInterval);
  }
}
