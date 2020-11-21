import { Queue } from "../queues/queueservice";
import { Service, ServiceParameters } from "./service";

class AsyncEvent {
  service: Service;
  type: string;
  payload: any;
  time: Date;

  constructor(service, type, payload = {}) {
    this.service = service;
    this.type = type;
    this.payload = payload;
    this.time = new Date();
  }

  static fromQueue(data) {
    let evt = new AsyncEvent(data.service, data.type, data.payload);
    evt.time = data.time;
    return evt;
  }

  getMapper() {
    return this.service + "_" + this.type;
  }
}

interface QueueMap {
  [key: string]: Queue;
}

export class EventServiceParameters extends ServiceParameters {
  queues?: { [key: string]: string };
  sync: boolean = false;
}

/**
 * @category CoreServices
 */
class EventService<T extends EventServiceParameters = EventServiceParameters> extends Service<T> {
  _callbacks: any = {};
  _queues: QueueMap = {};
  _defaultQueue: string = "";
  _async: boolean;

  /**
   * Load parameters
   *
   * @param params
   * @ignore
   */
  loadParameters(params: any): ServiceParameters {
    return new EventServiceParameters(params);
  }

  /**
   * @ignore
   * Setup the default routes
   */
  async computeParameters(): Promise<void> {
    if (this._params.queues) {
      Object.keys(this._params.queues).forEach(key => {
        // Define default as first queue
        if (!this._defaultQueue) {
          this._defaultQueue = key;
        }
        this._queues[key] = this.getService<Queue>(this._params.queues[key]);
      });
    }
    this._async = !this._params.sync;
    // Check we have at least one queue to handle asynchronous
    if (this._async && Object.keys(this._queues).length < 1) {
      this._webda.log("ERROR", "Need at least one queue for async to be ready", this._params);
      throw Error("Need at least one queue for async to be ready");
    }
  }

  bindAsyncListener(service, event, callback, queue) {
    if (!this._async) {
      throw Error("EventService is not configured for asynchronous");
    }
    if (!queue) {
      queue = this._defaultQueue;
    }
    let mapper = new AsyncEvent(service.getName(), event).getMapper();
    if (!this._callbacks[mapper]) {
      service.on(event, this.pushEvent.bind(this, service, event, queue));
      this._callbacks[mapper] = [];
    }
    this._callbacks[mapper].push(callback);
  }

  pushEvent(service, type, queue, payload) {
    let event = new AsyncEvent(service.getName(), type, payload);
    if (this._async) {
      return this._queues[queue].sendMessage(event);
    } else {
      return this._handleEvent(event);
    }
  }

  _handleEvent(event) {
    if (!this._callbacks[event.getMapper()]) {
      return Promise.reject("Callbacks should not be empty");
    }
    let promises = [];
    this._callbacks[event.getMapper()].map(executor => {
      promises.push(executor(event.payload, event));
    });
    // Need to handle the failure
    return Promise.all(promises);
  }

  _handleEvents(events) {
    events.map(event => {
      this._handleEvent(AsyncEvent.fromQueue(JSON.parse(event.Body)));
    });
  }

  worker(queue) {
    // Avoid loops
    this._async = false;
    return this._queues[queue].worker(this._handleEvents);
  }
}

export { EventService, QueueMap };
