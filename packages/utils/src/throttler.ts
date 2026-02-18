/**
 * Represent an item within the Throttler
 */
class ThrottlerItem {
  /**
   * Once the promise is in progress
   */
  public promise?: Promise<any>;
  constructor(
    public method: () => Promise<any>,
    public callbacks: ((res?: any) => void)[],
    public name: string
  ) {}
  /**
   * @returns A human-readable status string, e.g. `"myTask: IN-PROGRESS"` or `"myTask: QUEUED"`.
   */
  toString() {
    return `${this.name}: ${this.promise ? "IN-PROGRESS" : "QUEUED"}`;
  }
}

/**
 * Promise Throttler
 *
 * Allow you to queue promise and execute them concurrently
 *
 * Several libraries does that
 *
 * The queue method still gives you a simple Promise linked to the resolution
 * of your queued item, so you can still wait for the execution of the specific
 * item
 */
export class Throttler {
  /**
   * Current queue
   */
  protected _queue: ThrottlerItem[] = [];
  /**
   * Number of promises in-progress
   */
  current: number = 0;
  /**
   * Resolver for each call to waitForCompletion
   */
  protected _waiters: [() => void, (err) => void][] = [];
  /**
   * If one promise has failed and we are in fail fast mode
   */
  protected _failed: Error | null = null;

  /**
   * @param concurrency - Maximum number of promises to execute concurrently (default `10`).
   * @param failFast - When `true` (default), reject all pending items immediately on the first failure.
   */
  constructor(
    protected concurrency: number = 10,
    protected failFast: boolean = true
  ) {}

  /**
   * Convenience method: create a one-shot Throttler, queue the given method(s), and wait for completion.
   *
   * @param method - A single executor function or an array of executor functions to queue.
   * @param concurrency - Maximum concurrent executions (default `10`).
   * @returns A Promise that resolves when all queued items complete.
   */
  static run(method: (() => Promise<any>) | (() => Promise<any>)[], concurrency: number = 10): Promise<void> {
    const t = new Throttler(concurrency);
    t.queue(method);
    return t.wait();
  }

  /**
   * Alias for {@link queue}. Queue and execute one or more promise-returning functions.
   *
   * @param method - A single executor or an array of executors.
   * @param name - Optional name for the task, useful with `getInProgress` (default: `Promise_N`).
   * @returns A Promise (or `Promise.all`) linked to the queued item(s).
   */
  execute(
    method: (() => Promise<any>) | (() => Promise<any>)[],
    name: string = `Promise_${this.getSize()}`
  ): Promise<any> {
    return this.queue(method, name);
  }

  /**
   * Queue one or more promise-returning functions for concurrent execution.
   *
   * @param method - A single executor or an array of executors.
   * @param name - Optional name for the task, useful with `getInProgress` (default: `Promise_N`).
   * @returns A Promise linked to the queued item's resolution, or `Promise.all` for an array.
   */
  queue(
    method: (() => Promise<any>) | (() => Promise<any>)[],
    name: string = `Promise_${this.getSize()}`
  ): Promise<any | any[]> {
    if (this._failed && this.failFast) {
      return Promise.reject("Throttler has failed");
    }
    const wrap = (m: () => Promise<any>): Promise<any> => {
      return new Promise<any>((...callbacks) => {
        this._queue.push(new ThrottlerItem(m, callbacks, name));
        this.add();
      });
    };
    if (Array.isArray(method)) {
      return Promise.all(method.map(m => wrap(m)));
    } else {
      return wrap(<() => Promise<any>>method);
    }
  }

  /**
   * Set the concurrency
   * @param concurrency newValue
   *
   * If decreased, it will be in effect only when current promises resolve
   * If increased, it will have immediate effect
   */
  setConcurrency(concurrency: number) {
    let oldValue = this.concurrency;
    this.concurrency = concurrency;
    // Ensure we launch new promise if concurrency has increased
    while (oldValue < this.concurrency) {
      this.add();
      oldValue++;
    }
  }

  /**
   * Return all items that are currently executing (i.e. have an active Promise).
   *
   * @returns An array of in-progress `ThrottlerItem` instances.
   */
  getInProgress(): ThrottlerItem[] {
    return this._queue.filter(p => p.promise);
  }

  /**
   * Return the total number of items in the queue (both queued and in-progress).
   *
   * @returns The queue length.
   */
  getSize(): number {
    return this._queue.length;
  }

  /**
   * Wait until all queued and in-progress items have settled.
   *
   * @returns A Promise that resolves when the queue is empty, or rejects if `failFast` is enabled and any item failed.
   */
  async wait(): Promise<void> {
    if (this._failed && this.failFast) {
      return Promise.reject(this._failed);
    }
    if (this.current === 0) {
      return;
    }
    return new Promise((resolve, reject) => {
      this._waiters.push([resolve, reject]);
    });
  }

  /**
   * Flush all waiters
   */
  flushWaiters() {
    const index = this._failed ? 1 : 0;
    this._waiters.forEach(p => p[index](this._failed));
    this._waiters = [];
  }

  /**
   * Internal: attempt to start the next queued item if concurrency slots are available.
   * Also resolves or rejects all waiters when the queue drains.
   */
  protected add() {
    if (this.current >= this.concurrency || (this._failed && this.failFast)) {
      return;
    }
    const next = this._queue.find(p => !p.promise);
    if (!next) {
      if (this.current === 0) {
        // Call all waiters
        this.flushWaiters();
      }
      return;
    }
    this.current++;
    next.promise = next
      .method()
      .then(res => {
        // Call the resolve
        next.callbacks[0](res);
      })
      .catch(err => {
        if (this.failFast) {
          this._failed = err;
          this.flushWaiters();
        }
        // Call the reject
        next.callbacks[1](err);
      })
      .finally(() => {
        this.current--;
        // Remove from queue
        this._queue.splice(this._queue.indexOf(next), 1);
        this.add();
      });
  }
}
