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

  /**
   * Stop the iterator
   */
  stop() {
    this.running = false;
    this.resolve();
  }

  /**
   * Allow specific override
   * @param event
   * @param listener
   */
  bindListener(event: string, listener: (evt: any) => void) {
    this.eventEmitter.on(event, listener);
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
      for (let event in this.events) {
        this.listeners[event] = data => {
          this.push(event, data);
        };

        // We might have multiple listeners on the same event
        // We could optimize by keeping a map but not sure it is better
        this.bindListener(event, this.listeners[event]);
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
    let res = {};
    let available = false;
    let asyncs: {
      [key: string]: {
        attr: any;
        value: Promise<any>;
        type: string;
      };
    } = {};
    for (let i in data) {
      const attr = data[i];
      const getPromise = async attr => {
        let info = await attr.next();
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
      let p = Object.keys(asyncs).map(i => asyncs[i].value);
      await Promise.race(p);
    }
  }
}

/**
 * Utility class to iterate over an async generator
 */
export class IteratorUtils {
  /**
   * Iterate over an async generator and return an array
   * @param it
   * @returns
   */
  static async all<T, TReturn, TNext>(it: AsyncGenerator<T, TReturn, TNext>): Promise<T[]> {
    const res = [];
    for await (let i of it) {
      res.push(i);
    }
    return res;
  }
}
