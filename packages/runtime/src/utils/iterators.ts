import { EventEmitter } from "events";

/**
 * Iterate over events
 *
 * ```
 * for await (const evt of new EventIterator(this.eventEmitter).iterate({"event": true})) {
 *  console.log(evt);
 * }
 * ```
 *
 * This class should optimize to never use more than 1 listener per event / eventEmitter
 */
export class EventIterator {
  listeners: { [key: string]: (evt: any) => void };
  events: { [key: string]: (data: any) => any };
  queue: any[] = [];
  resolve: () => void;

  constructor(
    protected eventEmitter: EventEmitter,
    events: { [key: string]: true | ((data: any) => any) } | string,
    protected prefix?: string,
    protected initValue?: any
  ) {
    // Simplify for single event iterator
    if (typeof events === "string") {
      events = { [events]: i => i };
    }
    // Replace true by identity function
    for (let i in events) {
      if (events[i] === true) {
        events[i] = i => i;
      }
    }
    this.events = <{ [key: string]: (data: any) => any }>events;
    this.resolve = () => {};
  }

  async push(event: string, data: any) {
    let tdata = await this.events[event](data);
    if (tdata === undefined) {
      return;
    }
    this.queue.push(tdata);
    this.resolve();
  }

  async *iterate() {
    // using a queue and not the once method in case 2 events are sent successively
    this.listeners = {};
    try {
      if (this.initValue) {
        let value = this.initValue;
        if (this.initValue instanceof Promise) {
          value = await value;
        }
        yield this.prefix ? { [this.prefix]: value } : value;
      }
      this.eventEmitter.setMaxListeners(this.eventEmitter.getMaxListeners() + Object.keys(this.events).length);
      for (let event in this.events) {
        this.listeners[event] = data => {
          this.push(event, data);
        };
        // We might have multiple listeners on the same event
        // We could optimize by keeping a map but not sure it is better
        this.eventEmitter.on(event, this.listeners[event]);
      }
      while (true) {
        if (this.queue.length === 0) {
          // Wait for next event
          await new Promise<void>(resolve => {
            this.resolve = resolve;
          });
        }

        // Prefix the answer into an object
        yield this.prefix ? { [this.prefix]: this.queue.shift() } : this.queue.shift();
      }
    } finally {
      // Remove all listeners
      Object.keys(this.listeners).forEach(event => {
        this.eventEmitter.removeListener(event, this.listeners[event]);
      });
      this.listeners = {};
      // Avoid creating a map to get one listener that will ultimately be the same as having multiple listeners
      this.eventEmitter.setMaxListeners(this.eventEmitter.getMaxListeners() - Object.keys(this.events).length);
    }
  }
}
