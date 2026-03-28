import { WorkerLogLevel } from "@webda/workout";
import { EventEmitter } from "node:events";
/**
 * AsyncEventUnknown is a type that represents an object with string keys and unknown values
 */
export type AsyncEventUnknown = {
    [key: string]: unknown;
};
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
export declare class AsyncEventEmitterImpl<E extends AsyncEventUnknown = AsyncEventUnknown> implements AsyncEventEmitter<E> {
    private emitter;
    /**
     * @see EventEmitter.addListener
     */
    addListener<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void | Promise<void>): this;
    /**
     * @override
     */
    getMaxListeners(): number;
    /**
     * @override
     */
    setMaxListeners(n: number): this;
    /**
     * @see EventEmitter.once
     */
    once<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void): this;
    /**
     * @see EventEmitter.once
     */
    on<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void): this;
    /**
     * @see EventEmitter.removeListener
     */
    removeListener<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void): this;
    /**
     * @see EventEmitter.off
     */
    off<Key extends keyof E>(eventName: Key, listener: (event: E[Key]) => void): this;
    /**
     * @see EventEmitter.removeAllListeners
     */
    removeAllListeners<Key extends keyof E>(eventName?: Key): this;
    /**
     * Emit an event for this class
     *
     * Instead of returning a boolean, this method returns a Promise
     * so you can decide to wait for the event to be processed or not
     *
     * @see EventEmitter.emit
     */
    emit<Key extends keyof E>(eventName: Key, event: E[Key]): Promise<void>;
    /**
     * Get all listeners for an event
     * @param eventName
     */
    listeners(eventName: keyof E): Function[];
    /**
     * Constructor
     */
    protected constructor();
}
export declare class EventEmitterUtils {
    /**
     * Emit an event and wait for all listeners to finish
     * @param eventEmitter
     * @param event
     * @param data
     */
    static emit(eventEmitter: EventEmitter | AsyncEventEmitter, event: string | number | symbol, data: any, log: (level: WorkerLogLevel, ...args: any[]) => void, longListenerThreshold?: number): Promise<any[]>;
}
export type ModelEmitter<T extends AsyncEventUnknown> = Pick<AsyncEventEmitter<T>, "on" | "emit" | "removeAllListeners" | "once" | "off">;
//# sourceMappingURL=asynceventemitter.d.ts.map