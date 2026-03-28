import { EventEmitter } from "node:events";
export class EventWithContext {
}
const emitter = new EventEmitter();
/**
 * Emit a core event
 * @param event
 * @param data
 */
export function emitCoreEvent(event, data) {
    emitter.emit(event, data);
}
/**
 * Add a listener to a core event
 * @param event
 * @param listener
 */
export function useCoreEvents(event, listener, once = false) {
    emitter[once ? "once" : "on"](event, listener);
    return () => emitter.off(event, listener);
}
//# sourceMappingURL=events.js.map