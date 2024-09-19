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
  running: boolean;

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
    for (const i in events) {
      if (events[i] === true) {
        events[i] = i => i;
      }
    }
    this.events = <{ [key: string]: (data: any) => any }>events;
    this.resolve = () => {};
  }

  async push(event: string, data: any) {
    const tdata = await this.events[event](data);
    if (tdata === undefined) {
      return;
    }
    this.queue.push(tdata);
    this.resolve();
  }

  /**
   * Stop the iterator
   */
  stop() {
    this.running = false;
    this.resolve();
  }

  async *iterate() {
    this.running = true;
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
      for (const event in this.events) {
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
        if (!this.running) {
          break;
        }
        const value = this.queue.shift();
        // Prefix the answer into an object
        yield this.prefix ? { [this.prefix]: value } : value;
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

function isAsyncGenerator(it: any): it is AsyncGenerator {
  return (
    typeof it[Symbol.asyncIterator] == "function" && typeof it["next"] == "function" && typeof it["throw"] == "function"
  );
}

/**
 * Assemble to event iterator into one
 */
export class MergedIterator {
  static async *iterate(data: any, ignoreUndefined = false, transformer: (data: any) => any = a => a) {
    const res = {};
    let available = false;
    const asyncs: {
      [key: string]: {
        attr: any;
        value: Promise<any>;
        type: string;
      };
    } = {};
    for (const i in data) {
      const attr = data[i];
      const getPromise = async attr => {
        const info = await attr.next();
        available = true;
        if (info.done) {
          delete asyncs[i];
        } else {
          asyncs[i].value = getPromise(attr);
        }
        if (info.value || !ignoreUndefined) {
          res[i] = transformer(info.value);
        }
      };
      // check the interface
      if (isAsyncGenerator(attr)) {
        asyncs[i] = {
          attr,
          value: getPromise(attr),
          type: "asyncGenerator"
        };
      } else if (data[i] instanceof Promise) {
        asyncs[i] = {
          attr,
          value: (async () => {
            res[i] = await data[i];
            delete asyncs[i];
          })(),
          type: "promise"
        };
      } else {
        res[i] = data[i];
      }
    }
    yield res;
    while (Object.keys(asyncs).length) {
      if (available) {
        yield res;
        available = false;
      }
      const p = Object.keys(asyncs).map(i => asyncs[i].value);
      await Promise.race(p);
    }
  }
}
