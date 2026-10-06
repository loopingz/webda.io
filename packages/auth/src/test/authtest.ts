import { callOperation, runWithContext, WebContext } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { DebugMailer } from "@webda/core/lib/services/debugmailer.service.js";

/**
 * Base class for @webda/auth specs
 */
export abstract class AuthTest extends WebdaApplicationTest {
  mailer: DebugMailer;

  /** @override */
  async beforeEach() {
    await super.beforeEach();
    this.mailer = this.getService<any>("DefinedMailer") as DebugMailer;
    if (this.mailer) this.mailer.sent = [];
  }

  /**
   * @param body - request body
   * @returns a fresh web context with a session
   */
  async ctx(body: any = {}): Promise<WebContext> {
    const ctx = await this.newContext<WebContext>(body);
    ctx.newSession();
    return ctx;
  }

  /**
   * Run code inside a context
   * @param ctx - context
   * @param fn - code
   * @returns fn result
   */
  inContext<T>(ctx: WebContext, fn: () => Promise<T>): Promise<T> {
    return runWithContext(ctx, fn);
  }

  /**
   * Call an operation by id and parse its JSON output.
   *
   * Input is passed as the request body: a fresh `WebContext` is created for every call (the
   * input and the output are cached per context) and carries the session of `ctx`. The session
   * is copied back to `ctx` afterwards so a login in one call is visible in the next one.
   * Operations with an input schema receive the body fields as positional arguments, others
   * receive the body object as their single argument.
   * @param operationId - e.g. "Auth.Email.Login"
   * @param input - operation input (request body)
   * @param ctx - context to reuse (keeps the session between calls)
   * @returns parsed output
   */
  async op<T = any>(operationId: string, input: any = {}, ctx?: WebContext): Promise<T> {
    ctx ??= await this.ctx();
    const call = await this.newContext<WebContext>(input);
    call.setSession(ctx.getSession());
    try {
      await runWithContext(call, () => callOperation(call, operationId));
    } finally {
      ctx.setSession(call.getSession());
    }
    const body = call.getResponseBody();
    return body ? JSON.parse(body.toString()) : undefined;
  }
}
