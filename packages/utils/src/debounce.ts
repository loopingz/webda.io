"use strict";

/**
 * Options for debounce behavior
 */
export interface DebounceOptions {
  /**
   * If true, invoke the function on the leading edge of the timeout
   * @default false
   */
  leading?: boolean;

  /**
   * If true, invoke the function on the trailing edge of the timeout
   * @default true
   */
  trailing?: boolean;

  /**
   * Maximum time the function is allowed to be delayed before it's invoked
   * @default undefined (no maximum)
   */
  maxWait?: number;
}

/**
 * Debounced function with additional control methods
 */
export interface DebouncedFunction<T extends (...args: any[]) => any> {
  /**
   * Call the debounced function
   */
  (...args: Parameters<T>): void;

  /**
   * Cancel any pending function invocations
   */
  cancel(): void;

  /**
   * Immediately invoke any pending function invocation
   */
  flush(): void;

  /**
   * Check if there's a pending invocation
   */
  pending(): boolean;
}

/**
 * Creates a debounced function that delays invoking the provided function
 * until after `wait` milliseconds have elapsed since the last time the
 * debounced function was invoked.
 *
 * The debounced function comes with a `cancel` method to cancel delayed
 * invocations, a `flush` method to immediately invoke them, and a `pending`
 * method to check if the function is waiting to be invoked.
 *
 * @example
 * ```typescript
 * const saveData = debounce(async (data: string) => {
 *   await api.save(data);
 * }, 1000);
 *
 * // Will only call once after 1 second of no calls
 * saveData('hello');
 * saveData('world');
 * saveData('!'); // Only this call will execute after 1s
 *
 * // Cancel pending execution
 * saveData.cancel();
 *
 * // Execute immediately
 * saveData.flush();
 * ```
 *
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @param options Additional debounce options
 * @returns Returns the new debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options: DebounceOptions = {}
): DebouncedFunction<T> {
  let timerId: NodeJS.Timeout | undefined;
  let lastCallTime: number | undefined;
  let lastInvokeTime = 0;
  let lastArgs: Parameters<T> | undefined;
  let lastThis: any;
  let result: ReturnType<T> | undefined;

  const { leading = false, trailing = true, maxWait } = options;

  /**
   * Invoke the function
   */
  function invokeFunc(time: number): ReturnType<T> {
    const args = lastArgs!;
    const thisArg = lastThis;

    lastArgs = lastThis = undefined;
    lastInvokeTime = time;
    result = func.apply(thisArg, args);
    return result;
  }

  /**
   * Start a timer for the leading edge
   */
  function leadingEdge(time: number): ReturnType<T> | undefined {
    lastInvokeTime = time;

    // Start the timer for the trailing edge
    timerId = setTimeout(timerExpired, wait);

    // Invoke the leading edge
    return leading ? invokeFunc(time) : result;
  }

  /**
   * Calculate remaining wait time
   */
  function remainingWait(time: number): number {
    const timeSinceLastCall = time - lastCallTime!;
    const timeSinceLastInvoke = time - lastInvokeTime;
    const timeWaiting = wait - timeSinceLastCall;

    return maxWait !== undefined ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke) : timeWaiting;
  }

  /**
   * Check if the function should be invoked
   */
  function shouldInvoke(time: number): boolean {
    const timeSinceLastCall = time - (lastCallTime ?? 0);
    const timeSinceLastInvoke = time - lastInvokeTime;

    // Either this is the first call, activity has stopped, we're at the trailing edge,
    // the system time has gone backwards, or we've hit the maxWait limit
    return (
      lastCallTime === undefined ||
      timeSinceLastCall >= wait ||
      timeSinceLastCall < 0 ||
      (maxWait !== undefined && timeSinceLastInvoke >= maxWait)
    );
  }

  /**
   * Handle the timer expiration
   */
  function timerExpired(): void {
    const time = Date.now();

    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }

    // Restart the timer
    timerId = setTimeout(timerExpired, remainingWait(time));
  }

  /**
   * Handle the trailing edge
   */
  function trailingEdge(time: number): ReturnType<T> | undefined {
    timerId = undefined;

    // Only invoke if we have lastArgs which means func has been debounced at least once
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }

    lastArgs = lastThis = undefined;
    return result;
  }

  /**
   * Cancel any pending function invocations
   */
  function cancel(): void {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }

    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timerId = undefined;
  }

  /**
   * Immediately invoke any pending function invocation
   */
  function flush(): ReturnType<T> | undefined {
    return timerId === undefined ? result : trailingEdge(Date.now());
  }

  /**
   * Check if there's a pending invocation
   */
  function pending(): boolean {
    return timerId !== undefined;
  }

  /**
   * The debounced function
   */
  function debounced(this: any, ...args: Parameters<T>): void {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timerId === undefined) {
        return leadingEdge(lastCallTime) as any;
      }
      if (maxWait !== undefined) {
        // Handle invocations in a tight loop
        timerId = setTimeout(timerExpired, wait);
        return invokeFunc(lastCallTime) as any;
      }
    }

    if (timerId === undefined) {
      timerId = setTimeout(timerExpired, wait);
    }
  }

  debounced.cancel = cancel;
  debounced.flush = flush;
  debounced.pending = pending;

  return debounced as DebouncedFunction<T>;
}

