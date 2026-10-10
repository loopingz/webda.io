/**
 * A push-based async iterable: producers push, one consumer iterates. `end()` (or the consumer leaving the loop)
 * finishes it; items pushed after the end are dropped.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: ((result: IteratorResult<T>) => void)[] = [];
  private done = false;
  private sizes: number[] = [];
  private bytes = 0;
  private readonly size?: (item: T) => number;

  /**
   * @param options - optional settings
   * @param options.size - measures an item in bytes, to track `pendingBytes`
   */
  constructor(options: { size?: (item: T) => number } = {}) {
    this.size = options.size;
  }

  /**
   * @returns whether the queue is finished
   */
  get ended(): boolean {
    return this.done;
  }

  /**
   * @param item - the next item
   * @param size - its size in bytes (defaults to the size function's result)
   */
  push(item: T, size?: number): void {
    if (this.done) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: item, done: false });
    else {
      const bytes = size ?? this.size?.(item) ?? 0;
      this.items.push(item);
      this.sizes.push(bytes);
      this.bytes += bytes;
    }
  }

  /**
   * @returns the size of the items pushed and not yet consumed (0 when no size is given)
   */
  get pendingBytes(): number {
    return this.bytes;
  }

  /**
   * @returns the number of items pushed and not yet consumed
   */
  get pending(): number {
    return this.items.length;
  }

  /**
   * No more items.
   * @param discard - also drop the items not consumed yet
   */
  end(discard: boolean = false): void {
    if (discard) {
      this.items.length = 0;
      this.sizes.length = 0;
      this.bytes = 0;
    }
    if (this.done) return;
    this.done = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true });
  }

  /**
   * @returns the next item, without ending the queue (unlike breaking out of a for await)
   */
  next(): Promise<IteratorResult<T>> {
    if (this.items.length > 0) {
      const value = this.items.shift()!;
      this.bytes -= this.sizes.shift()!;
      return Promise.resolve({ value, done: false });
    }
    if (this.done) return Promise.resolve({ value: undefined, done: true });
    return new Promise(resolve => this.waiters.push(resolve));
  }

  /**
   * @returns the iterator
   */
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.next(),
      return: async () => {
        this.end();
        return { value: undefined, done: true };
      }
    };
  }
}
