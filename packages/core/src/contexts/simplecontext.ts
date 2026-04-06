import { streamToBuffer } from "@webda/utils";
import { Session } from "../session/session.js";
import { OperationContext } from "./operationcontext.js";

/**
 * Simple Operation Context with custom input
 */
export class SimpleOperationContext extends OperationContext {
  input: Buffer;

  /**
   * Create another context from an existing one
   * @param context - the execution context
   * @returns the result
   */
  static async fromContext(context: OperationContext): Promise<SimpleOperationContext> {
    const ctx = new SimpleOperationContext(context["_webda"]);
    ctx.setSession(context.getSession());
    const stream = context.getRawStream();
    ctx.setInput(await streamToBuffer(stream));
    return ctx;
  }

  /**
   * Set the input
   * @param input - the input
   * @returns this for chaining
   */
  setInput(input: Buffer): this {
    this.input = input;
    return this;
  }

  /**
   * Set the session
   * @param session - the session object
   * @returns this for chaining
   */
  setSession(session: Session): this {
    this.session = session;
    return this;
  }

  /**
   * @override
   */
  async getRawInput(limit: number = 1024 * 1024 * 10, _timeout: number = 60000): Promise<Buffer> {
    return this.input.subarray(0, limit);
  }
}
