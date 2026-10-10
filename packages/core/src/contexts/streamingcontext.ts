import { JSONUtils } from "@webda/utils";
import { WebContext } from "./webcontext.js";
import * as WebdaError from "../errors/errors.js";

/**
 * A value as clients may see it: plain JSON without `__` keys
 * @param value - an operation result or streamed chunk
 * @returns the copy (undefined stays undefined), or null when the value is not JSON-serializable (function, symbol)
 */
export function toPublicChunk(value: unknown): unknown {
  if (value === undefined) return undefined;
  const json = JSONUtils.stringify(value, undefined, 0, true);
  return json === undefined ? null : JSON.parse(json);
}

/**
 * The shared part of a context serving a streaming operation over a transport (gRPC, WebSocket, GraphQL
 * subscription, ...):
 *
 * - a non-streamed result is buffered as usual (`writeResult()`)
 * - a streamed chunk is sent right away (`sendChunk()`), `write()` returning false under backpressure
 * - `drained()` waits for the transport (`waitForDrain()`) without leaving listeners behind: the signal it gets is
 *   aborted once the wait is over
 * - once cancelled (the client went away) or once the connection is over (`connectionEnded`), `write()` and
 *   `drained()` throw `OperationCancelledError`
 *
 * The transport calls `cancel()` when the client leaves, and also ends the operation's input queue so its pending read
 * returns and its `finally` blocks run.
 */
export abstract class StreamingOperationContext extends WebContext {
  private cancelled = false;

  /**
   * @returns whether the client went away
   */
  get isCancelled(): boolean {
    return this.cancelled;
  }

  /** The client went away: the next write or drain throws. */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * @returns true when nothing can be sent anymore although the context was not cancelled (response or socket over)
   */
  protected abstract get connectionEnded(): boolean;

  /**
   * Send one streamed chunk now
   * @param chunk - what the operation wrote
   * @returns false when the transport asks the operation to wait for `drained()`
   */
  protected abstract sendChunk(chunk: any): boolean;

  /**
   * Wait until the transport can take more output
   * @param signal - aborted once the wait is over: listeners registered with it are removed
   * @throws any error when the transport failed or closed (reported as `OperationCancelledError`)
   */
  protected abstract waitForDrain(signal: AbortSignal): Promise<void>;

  /**
   * Keep a non-streamed result
   * @param output - the result
   * @param encoding - the encoding to use
   * @param cb - the callback function
   * @returns true
   */
  protected writeResult(output: any, encoding?: string, cb?: (error: Error) => void): boolean {
    return super.write(output, encoding, cb);
  }

  /**
   * @throws OperationCancelledError when the client went away or the connection is over
   */
  protected assertAlive(): void {
    if (this.cancelled || this.connectionEnded) {
      throw new WebdaError.OperationCancelledError();
    }
  }

  /**
   * Streamed chunks go out immediately; a non-streamed result is buffered
   * @override
   * @throws OperationCancelledError when streaming and the client went away or the connection is over
   */
  // @ts-ignore same signature as WebContext.write
  public write(output: any, encoding?: string, cb?: (error: Error) => void): boolean {
    if (!this.getExtension("operationStreaming")) return this.writeResult(output, encoding, cb);
    this.assertAlive();
    return this.sendChunk(output);
  }

  /**
   * Wait for the transport to take more output, without leaving listeners behind
   * @override
   * @throws OperationCancelledError when the client went away, the connection is over or the transport failed
   */
  async drained(): Promise<void> {
    this.assertAlive();
    const controller = new AbortController();
    try {
      await this.waitForDrain(controller.signal);
    } catch (err) {
      if (err instanceof WebdaError.OperationCancelledError) throw err;
      throw new WebdaError.OperationCancelledError();
    } finally {
      controller.abort();
    }
    this.assertAlive();
  }
}
