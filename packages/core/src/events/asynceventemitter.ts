import { WorkerLogLevel } from "@webda/workout";
import { EventEmitter } from "node:events";

/**
 * AsyncEventUnknown is a type that represents an object with string keys and unknown values
 */
export type AsyncEventUnknown = { [key: string]: unknown };

/**
 * Similar to EventEmitter but emit returns a Promise
 * so you can decide to wait for the event to be processed or not
 */
 
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

/** Concrete implementation of AsyncEventEmitter that wraps Node.js EventEmitter with async support */
export class AsyncEventEmitterImpl<E extends AsyncEventUnknown = AsyncEventUnknown> implements AsyncEventEmitter<E> {
  private emitter: EventEmitter;

  /**
   * @see EventEmitter.addListener
   * @param eventName - the event name
   * @param listener - the event listener
   * @returns this for chaining
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
   * @param eventName - the event name
   * @param listener - the event listener
   * @returns this for chaining
   */
  once<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void): this {
    this.emitter.once(<string>eventName, listener);
    return this;
  }

  /**
   * @see EventEmitter.once
   * @param eventName - the event name
   * @param listener - the event listener
   * @returns this for chaining
   */
  on<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void): this {
    this.emitter.on(<string>eventName, listener);
    return this;
  }

  /**
   * @see EventEmitter.removeListener
   * @param eventName - the event name
   * @param listener - the event listener
   * @returns this for chaining
   */
  removeListener<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void): this {
    this.emitter.removeListener(<string>eventName, listener);
    return this;
  }

  /**
   * @see EventEmitter.off
   * @param eventName - the event name
   * @param listener - the event listener
   * @returns this for chaining
   */
  off<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void): this {
    return this.removeListener(eventName, listener);
  }

  /**
   * @see EventEmitter.removeAllListeners
   * @param eventName - the event name
   * @returns this for chaining
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
   * @param eventName - the event name
   * @param event - the event name
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
   * @param eventName - the event name
   * @returns the list of results
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

/** Utility class for emitting events and awaiting all listeners */
export class EventEmitterUtils {
  /**
   * Emit an event and wait for all listeners to finish
   * @param eventEmitter - the event emitter
   * @param event - the event name
   * @param data - the data to process
   * @param log - the logger instance
   * @param longListenerThreshold - threshold for long listener warnings
   * @returns the result number
   */
  static async emit(
    eventEmitter: EventEmitter | AsyncEventEmitter,
    event: string | number | symbol,
    data: any,
    log: (level: WorkerLogLevel, ...args: any[]) => void,
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

export type ModelEmitter<T extends AsyncEventUnknown> = Pick<
  AsyncEventEmitter<T>,
  "on" | "emit" | "removeAllListeners" | "once" | "off"
>;
