import { EventEmitter } from "node:events";
export class AsyncEventEmitterImpl {
    /**
     * @see EventEmitter.addListener
     */
    addListener(eventName, listener) {
        this.emitter.addListener(eventName, listener);
        return this;
    }
    /**
     * @override
     */
    getMaxListeners() {
        return this.emitter.getMaxListeners();
    }
    /**
     * @override
     */
    setMaxListeners(n) {
        this.emitter.setMaxListeners(n);
        return this;
    }
    /**
     * @see EventEmitter.once
     */
    once(eventName, listener) {
        this.emitter.once(eventName, listener);
        return this;
    }
    /**
     * @see EventEmitter.once
     */
    on(eventName, listener) {
        this.emitter.on(eventName, listener);
        return this;
    }
    /**
     * @see EventEmitter.removeListener
     */
    removeListener(eventName, listener) {
        this.emitter.removeListener(eventName, listener);
        return this;
    }
    /**
     * @see EventEmitter.off
     */
    off(eventName, listener) {
        return this.removeListener(eventName, listener);
    }
    /**
     * @see EventEmitter.removeAllListeners
     */
    removeAllListeners(eventName) {
        this.emitter.removeAllListeners(eventName);
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
    async emit(eventName, event) {
        let result;
        const promises = [];
        const listeners = this.emitter.listeners(eventName);
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
    listeners(eventName) {
        return this.emitter.listeners(eventName);
    }
    /**
     * Constructor
     */
    constructor() {
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
    static async emit(eventEmitter, event, data, log, longListenerThreshold = 100) {
        const promises = [];
        const elapse = start => {
            const elapsed = Date.now() - start;
            if (elapsed > longListenerThreshold) {
                log("INFO", "Long listener", elapsed, "ms");
            }
        };
        for (const listener of eventEmitter.listeners(event)) {
            const start = Date.now();
            const result = listener(data);
            if (result instanceof Promise) {
                promises.push(result
                    .finally(() => {
                    elapse(start);
                })
                    .catch(err => {
                    log("ERROR", "Listener error", err);
                    throw err;
                }));
            }
            else {
                elapse(start);
            }
        }
        return Promise.all(promises);
    }
}
//# sourceMappingURL=asynceventemitter.js.map