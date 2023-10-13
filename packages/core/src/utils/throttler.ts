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
  protected _waiters: (() => void)[] = [];

  /**
   *
   * @param concurrency max concurrent promise to execute
   */
  constructor(protected concurrency: number = 10) {}

  /**
   * Execute a new promise
   *
   * Alias for queue
   * @param method
   * @param name
   * @returns
   */
  execute(method: () => Promise<any>, name: string = `Promise_${this.getSize()}`): Promise<any> {
    return this.queue(method, name);
  }

  /**
   * Queue a new promise
   *
   * @param method executor that return the promise to queue
   * @param name of the task, usefull when calling getInProgress
   * @returns
   */
  queue(method: () => Promise<any>, name: string = `Promise_${this.getSize()}`): Promise<any> {
    return new Promise<any>((...callbacks) => {
      this._queue.push(new ThrottlerItem(method, callbacks, name));
      this.add();
    });
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

  // REFACTOR . >= 4.0.0
  /**
   * @deprecated
   */
  async waitForCompletion(): Promise<void> {
    return this.wait();
  }
  // END_REFACTOR

  /**
   * Wait until every promise resolve
   * @returns
   */
  async wait(): Promise<void> {
    if (this.current === 0) {
      return;
    }
    return new Promise(resolve => {
      this._waiters.push(resolve);
    });
  }

  /**
   * Internal manage the promise concurrency
   * @returns
   */
  protected add() {
    if (this.current >= this.concurrency) {
      return;
    }
    const next = this._queue.find(p => !p.promise);
    if (!next) {
      if (this.current === 0) {
        // Call all waiters
        this._waiters.forEach(p => p());
        this._waiters = [];
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
