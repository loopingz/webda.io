import { JSONUtils } from "@webda/utils";
import { Session } from "../session/session";
import { OperationContext } from "./operationcontext";

/**
 * Simple Operation Context with custom input
 */
export class SimpleOperationContext extends OperationContext {
  input: Buffer;

  /**
   * Create another context from an existing one
   * @param context
   * @returns
   */
  static async fromContext(context: OperationContext): Promise<SimpleOperationContext> {
    const ctx = new SimpleOperationContext(context["_webda"]);
    ctx.setSession(context.getSession());
    ctx.setInput(Buffer.from(JSONUtils.stringify(await context.getInput())));
    return ctx;
  }

  /**
   * Set the input
   */
  setInput(input: Buffer): this {
    this.input = input;
    return this;
  }

  /**
   * Set the session
   * @param session
   * @returns
   */
  setSession(session: Session): this {
    this.session = session;
    return this;
  }

  /**
   * @override
   */
  async getRawInput(limit: number = 1024 * 1024 * 10, _timeout: number = 60000): Promise<Buffer> {
    return this.input.slice(0, limit);
  }
}
