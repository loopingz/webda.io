import { EventEmitter } from "node:events";

/**
 * AsyncEventUnknown is a type that represents an object with string keys and unknown values
 */
export type AsyncEventUnknown = { [key: string]: unknown };

/**
 * Similar to EventEmitter but emit returns a Promise
 * so you can decide to wait for the event to be processed or not
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AsyncEventEmitter<E extends AsyncEventUnknown = AsyncEventUnknown> {
  /**
   * EventEmitter interface
   * @param event
   * @param listener
   */
  addListener<Key extends keyof E>(event: Key, listener: (event: E[Key]) => void | Promise<void>): this;
  /**
   * EventEmitter interface
   * @param event
   * @param listener
   */
  once<Key extends keyof E>(event: Key, listener: (event: E[Key]) => void | Promise<void>): this;
  /**
   * EventEmitter interface
   * @param event
   * @param listener
   */
  on<Key extends keyof E>(event: Key, listener: (event: E[Key]) => void | Promise<void>): this;
  /**
   * EventEmitter interface
   * @param event
   * @param listener
   */
  removeListener<Key extends keyof E>(event: Key, listener: (event: E[Key]) => void | Promise<void>): this;
  /**
   * EventEmitter interface
   * @param event
   * @param listener
   */
  off<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void | Promise<void>): this;
  /**
   * EventEmitter interface
   * @param event
   * @param listener
   */
  removeAllListeners(eventName?: keyof E): this;
  /**
   * Emit an event for this class
   * @param this
   * @param event
   * @param evt
   */
  emit<Key extends keyof E>(eventName: keyof E, event: E[Key]): Promise<void>;
  /**
   *
   * @param eventName
   */
  listeners(eventName: keyof E): Function[];
  /**
   * @override
   */
  setMaxListeners(n: number): this;
  /**
   * @override
   */
  getMaxListeners(): number;
}

export class AsyncEventEmitterImpl<E extends AsyncEventUnknown = AsyncEventUnknown> implements AsyncEventEmitter<E> {
  private emitter: EventEmitter;

  /**
   * @see EventEmitter.addListener
   */
  addListener<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void | Promise<void>): this {
    this.emitter.addListener(<string>eventName, listener);
    return this;
  }
  /**
   * @override
   */
  getMaxListeners(): number {
    return this.emitter.getMaxListeners();
  }

  /**
   * @override
   */
  setMaxListeners(n: number): this {
    this.emitter.setMaxListeners(n);
    return this;
  }

  /**
   * @see EventEmitter.once
   */
  once<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void): this {
    this.emitter.once(<string>eventName, listener);
    return this;
  }

  /**
   * @see EventEmitter.once
   */
  on<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void): this {
    this.emitter.on(<string>eventName, listener);
    return this;
  }

  /**
   * @see EventEmitter.removeListener
   */
  removeListener<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void): this {
    this.emitter.removeListener(<string>eventName, listener);
    return this;
  }

  /**
   * @see EventEmitter.off
   */
  off<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void): this {
    return this.removeListener(eventName, listener);
  }

  /**
   * @see EventEmitter.removeAllListeners
   */
  removeAllListeners<Key extends keyof E>(eventName?: Key): this {
    this.emitter.removeAllListeners(<string>eventName);
    return this;
  }

  /**
   * Emit an event for this class
   *
   * Instead of returning a boolean, this method returns a Promise
   * so you can decide to wait for the event to be processed or not
   *
   * @see EventEmitter.emit
   */
  async emit<Key extends keyof E>(eventName: Key, event: E[Key]): Promise<void> {
    let result;
    const promises = [];
    const listeners = this.emitter.listeners(<string>eventName);
    for (const listener of listeners) {
      result = listener(event);
      if (result instanceof Promise) {
        promises.push(result);
      }
    }
    await Promise.all(promises);
  }

  /**
   * Get all listeners for an event
   * @param eventName
   */
  listeners(eventName: keyof E): Function[] {
    return this.emitter.listeners(<string>eventName);
  }

  /**
   * Constructor
   */
  protected constructor() {
    this.emitter = new EventEmitter();
  }
}

export class EventEmitterUtils {
  /**
   * Emit an event and wait for all listeners to finish
   * @param eventEmitter
   * @param event
   * @param data
   */
  static async emit(
    eventEmitter: EventEmitter | AsyncEventEmitter,
    event: string | number | symbol,
    data: any,
    log: (level: string, ...args: any[]) => void,
    longListenerThreshold: number = 100
  ) {
    const promises = [];
    const elapse = start => {
      const elapsed = Date.now() - start;
      if (elapsed > longListenerThreshold) {
        log("INFO", "Long listener", elapsed, "ms");
      }
    };
    for (const listener of eventEmitter.listeners(<string>event)) {
      const start = Date.now();
      const result = listener(data);
      if (result instanceof Promise) {
        promises.push(
          result
            .finally(() => {
              elapse(start);
            })
            .catch(err => {
              log("ERROR", "Listener error", err);
              throw err;
            })
        );
      } else {
        elapse(start);
      }
    }
    return Promise.all(promises);
  }
}
