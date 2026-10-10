/**
 * A push-based async iterable: producers push, one consumer iterates. `end()` (or the consumer leaving the loop)
 * finishes it; items pushed after the end are dropped.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: ((result: IteratorResult<T>) => void)[] = [];
  private done = false;

  /**
   * @returns whether the queue is finished
   */
  get ended(): boolean {
    return this.done;
  }

  /**
   * @param item - the next item
   */
  push(item: T): void {
    if (this.done) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: item, done: false });
    else this.items.push(item);
  }

  /** No more items. */
  end(): void {
    if (this.done) return;
    this.done = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true });
  }

  /**
   * @returns the next item, without ending the queue (unlike breaking out of a for await)
   */
  next(): Promise<IteratorResult<T>> {
    if (this.items.length > 0) return Promise.resolve({ value: this.items.shift()!, done: false });
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
