import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { canCallOperation, getOperationStreaming, listOperations } from "../core/operations.js";
import { useApplication } from "../application/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import * as WebdaError from "../errors/errors.js";
import type { WebContext } from "../contexts/webcontext.js";
import { runOperation } from "./streaming.js";

/** Parameters of the operation-id transport */
export class OperationIdTransportParameters extends ServiceParameters {
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
> extends Service<T> {
  /** @override */
  resolve(): this {
    super.resolve();
    this.addRoute(this.parameters.url, ["GET"], this.list, { hidden: true } as any);
    this.addRoute(`${this.parameters.url}/{id}`, ["POST"], this.call, { hidden: true } as any);
    return this;
  }

  /**
   * List the operations the caller (and its token scope) may call
   * @param ctx - web context
   */
  async list(ctx: WebContext): Promise<void> {
    const app = useApplication();
    const operations: Record<string, any> = {};
    for (const [id, op] of Object.entries(listOperations())) {
      if (op.hidden || !(await canCallOperation(ctx, id))) continue;
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
    ctx.setHeader("Content-Type", "application/json");
    ctx.write({ operations });
  }

  /**
   * Call an operation by id
   * @param ctx - web context
   */
  async call(ctx: WebContext): Promise<void> {
    const id = ctx.getParameters().id;
    if (!useInstanceStorage().operations[id]) {
      throw new WebdaError.NotFound(`${id} Unknown`);
    }
    await runOperation(ctx, id, this.parameters.streamKeepAliveInterval);
  }
}
