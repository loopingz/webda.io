/**
 * Result of a work item: a delay to process the key again
 */
export type WorkResult = void | { requeueAfter?: number };

/**
 * Options of a work queue
 */
export interface WorkQueueOptions {
  /**
   * Keys processed at the same time
   * @default 1
   */
  concurrency?: number;
  /**
   * Milliseconds before processing again a key that failed, doubled on each consecutive failure
   * @default 1000
   */
  baseDelay?: number;
  /**
   * Maximum milliseconds before processing again a key that failed
   * @default 300000
   */
  maxDelay?: number;
  /**
   * Called when processing a key fails
   */
  onError?: (key: string, err: unknown, delay: number) => void;
}

/**
 * Queue of keys to process, as the work queue of a Kubernetes controller
 *
 * A key is never processed twice at the same time: added while queued it is queued once, added while processed it is
 * processed again once done. A failure processes the key again after an exponential backoff, a result can ask to
 * process it again after a delay.
 */
export class WorkQueue {
  protected queue: string[] = [];
  protected queued = new Set<string>();
  protected processing = new Set<string>();
  /** keys added while processed */
  protected dirty = new Set<string>();
  protected failures = new Map<string, number>();
  protected timers = new Map<string, NodeJS.Timeout>();
  protected stopped = false;
  protected idle: (() => void)[] = [];
  protected concurrency: number;
  protected baseDelay: number;
  protected maxDelay: number;

  /**
   * @param handler - process a key
   * @param options - concurrency and backoff
   */
  constructor(
    protected handler: (key: string) => Promise<WorkResult>,
    protected options: WorkQueueOptions = {}
  ) {
    this.concurrency = options.concurrency ?? 1;
    this.baseDelay = options.baseDelay ?? 1000;
    this.maxDelay = options.maxDelay ?? 300000;
  }

  /**
   * @returns the keys waiting to be processed
   */
  get depth(): number {
    return this.queue.length;
  }

  /**
   * Process a key as soon as possible
   * @param key - the key
   */
  add(key: string): void {
    if (this.stopped) return;
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    if (this.processing.has(key)) {
      this.dirty.add(key);
      return;
    }
    if (this.queued.has(key)) return;
    this.queued.add(key);
    this.queue.push(key);
    this.pump();
  }

  /**
   * Process a key after a delay, unless it is added before
   * @param key - the key
   * @param delay - milliseconds
   */
  addAfter(key: string, delay: number): void {
    if (this.stopped) return;
    clearTimeout(this.timers.get(key));
    const timer = setTimeout(() => {
      this.timers.delete(key);
      this.add(key);
    }, delay);
    timer.unref?.();
    this.timers.set(key, timer);
  }

  /**
   * Stop processing: the pending keys are dropped
   * @returns once the keys being processed are done
   */
  async stop(): Promise<void> {
    this.stopped = true;
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.queue = [];
    this.queued.clear();
    this.dirty.clear();
    await this.drain();
  }

  /**
   * @returns once no key is queued nor processed
   */
  async drain(): Promise<void> {
    if (!this.queue.length && !this.processing.size) return;
    await new Promise<void>(resolve => this.idle.push(resolve));
  }

  /**
   * Start processing the queued keys, up to the concurrency
   */
  protected pump(): void {
    while (!this.stopped && this.processing.size < this.concurrency && this.queue.length) {
      const key = this.queue.shift()!;
      this.queued.delete(key);
      this.processing.add(key);
      void this.process(key);
    }
    if (!this.queue.length && !this.processing.size) {
      this.idle.splice(0).forEach(resolve => resolve());
    }
  }

  /**
   * Process a key, then schedule it again if needed
   * @param key - the key
   */
  protected async process(key: string): Promise<void> {
    try {
      const result = await this.handler(key);
      this.failures.delete(key);
      if (result?.requeueAfter !== undefined) this.addAfter(key, result.requeueAfter);
    } catch (err) {
      const failures = (this.failures.get(key) ?? 0) + 1;
      this.failures.set(key, failures);
      const delay = Math.min(this.baseDelay * 2 ** (failures - 1), this.maxDelay);
      this.options.onError?.(key, err, delay);
      this.addAfter(key, delay);
    } finally {
      this.processing.delete(key);
      if (this.dirty.delete(key)) this.add(key);
      this.pump();
    }
  }
}
