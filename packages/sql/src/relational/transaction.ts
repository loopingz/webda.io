import type { SQLClient } from "../dialect.js";

/**
 * Run statements in one transaction: `BEGIN`, the function, `COMMIT`; `ROLLBACK` and rethrow when it throws
 * @param client - a client whose statements run on one connection
 * @param fn - the statements, run on the client
 * @returns the function result
 */
export async function runTransaction<R>(client: SQLClient, fn: (tx: SQLClient) => Promise<R>): Promise<R> {
  await client.query("BEGIN");
  try {
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      /* the original error is the one to report */
    });
    throw err;
  }
}

/**
 * Runs transactions one at a time on a connection that is not pooled
 */
export type Transact = <R>(fn: (tx: SQLClient) => Promise<R>) => Promise<R>;

/**
 * FIFO lock: each `run` starts once the previous one settled, whether it resolved or rejected
 */
export class AsyncMutex {
  private tail: Promise<unknown> = Promise.resolve();

  /**
   * @param fn - the exclusive section
   * @returns the function result
   */
  run<R>(fn: () => Promise<R>): Promise<R> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
