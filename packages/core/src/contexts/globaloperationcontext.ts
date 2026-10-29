import { WritableStreamBuffer } from "stream-buffers";
import { Session } from "../session/session.js";
import { setSystemContextFactory } from "./execution.js";
import { SimpleOperationContext } from "./simplecontext.js";

/**
 * Operation context of the system
 *
 * Unlike {@link GlobalContext}, it can be given to `callOperation`: the call gets input validation, authorizers and
 * operation events. It has an empty session, `getCurrentUserId()` is `"system"`, and the operation `permission`
 * queries and the `maxMfaAge` check let it through. A `canAct` detects it with `context.isGlobalContext()`.
 *
 * Each call to {@link useSystem} or `runAsSystem` creates a new one: `callOperation` writes per-call state on it.
 */
export class GlobalOperationContext extends SimpleOperationContext {
  /**
   * Create a system context with an empty session and an empty input
   */
  constructor() {
    super();
    this.session = new Session();
    this.input = Buffer.alloc(0);
  }

  /**
   * Start with a small output buffer: runAsSystem runs on hot paths and rarely writes output
   * @override
   */
  createStream() {
    this._stream = new WritableStreamBuffer({ initialSize: 1024, incrementAmount: 100 * 1024 });
  }

  /**
   * @override
   */
  getCurrentUserId(): string {
    return "system";
  }

  /**
   * @override
   */
  isGlobalContext(): boolean {
    return true;
  }

  /**
   * The system is not a user
   * @override
   */
  async getCurrentUser<K>(): Promise<K> {
    return undefined;
  }
}

/**
 * Create a system operation context, to call an operation as the system
 *
 * ```ts
 * const ctx = useSystem({ full: true });
 * await callOperation(ctx, "Service.Method");
 * ```
 * @param input - the operation input, serialized as JSON
 * @returns a new system operation context
 */
export function useSystem<T = any>(input?: T): GlobalOperationContext {
  const ctx = new GlobalOperationContext();
  if (input !== undefined) {
    ctx.setInput(Buffer.from(JSON.stringify(input)));
  }
  return ctx;
}

// execution.ts cannot import this file (operationcontext.ts imports execution.ts)
setSystemContextFactory(() => new GlobalOperationContext());
