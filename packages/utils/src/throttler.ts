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
   *
   * @param concurrency max concurrent promise to execute
   */
  constructor(
    protected concurrency: number = 10,
    protected failFast: boolean = true
  ) {}

  /**
   * Run a Throttler without having to instanciate it
   * @param method
   * @param concurrency
   * @returns
   */
  static run(method: (() => Promise<any>) | (() => Promise<any>)[], concurrency: number = 10): Promise<void> {
    const t = new Throttler(concurrency);
    t.queue(method);
    return t.wait();
  }

  /**
   * Execute a new promise
   *
   * Alias for queue
   * @param method
   * @param name
   * @returns
   */
  execute(
    method: (() => Promise<any>) | (() => Promise<any>)[],
    name: string = `Promise_${this.getSize()}`
  ): Promise<any> {
    return this.queue(method, name);
  }

  /**
   * Queue a new promise
   *
   * @param method executor that return the promise to queue
   * @param name of the task, usefull when calling getInProgress
   * @returns
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
   * Get inprogress items
   * @returns
   */
  getInProgress(): ThrottlerItem[] {
    return this._queue.filter(p => p.promise);
  }

  /**
   * Get global queue size
   * @returns
   */
  getSize(): number {
    return this._queue.length;
  }

  /**
   * Wait until every promise resolve
   * @returns
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
   * Internal manage the promise concurrency
   * @returns
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
