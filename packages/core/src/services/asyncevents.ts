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
  /**
   * Queues to post async events to
   */
  queues?: { [key: string]: string };
  /**
   * Make the event sending asynchronous
   */
  sync?: boolean = false;
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
    if (this.parameters.queues) {
      Object.keys(this.parameters.queues).forEach(key => {
        // Define default as first queue
        if (!this._defaultQueue) {
          this._defaultQueue = key;
        }
        this._queues[key] = this.getService<Queue>(this.parameters.queues[key]);
      });
    }
    this._async = !this.parameters.sync;
    // Check we have at least one queue to handle asynchronous
    if (this._async && Object.keys(this._queues).length < 1) {
      this._webda.log("ERROR", "Need at least one queue for async to be ready", this.parameters);
      throw Error("Need at least one queue for async to be ready");
    }
  }

  /**
   * Bind a asynchronous event
   *
   * ```mermaid
   * sequenceDiagram
   *  participant S as Service
   *  participant As as AsyncEventService
   *  participant Q as Queue
   *  participant Aw as AsyncEventService Worker
   *
   *  As->>S: Bind event to a sendQueue listener
   *  activate As
   *  S->>As: Emit event
   *  As->>Q: Push the event to the queue
   *  deactivate As
   *  Aw->>Q: Consume queue
   *  Aw->>Aw: Call the original listener
   * ```
   *
   * @param service
   * @param event
   * @param callback
   * @param queue
   */
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

  async pushEvent(service, type, queue, payload) {
    let event = new AsyncEvent(service.getName(), type, payload);
    if (this._async) {
      return this._queues[queue].sendMessage(event);
    } else {
      return this.handleEvent(event);
    }
  }

  /**
   * Process one event
   *
   * @param event
   * @returns
   */
  protected async handleEvent(event): Promise<void> {
    if (!this._callbacks[event.getMapper()]) {
      return Promise.reject("Callbacks should not be empty");
    }
    let promises = [];
    this._callbacks[event.getMapper()].map(executor => {
      promises.push(executor(event.payload, event));
    });
    // Need to handle the failure
    await Promise.all(promises);
  }

  /**
   * Process asynchronous event on queue
   * @param queue
   * @returns
   */
  worker(queue: string = this._defaultQueue): Promise<void> {
    // Avoid loops
    this._async = false;
    return this._queues[queue].consume(this.handleEvent);
  }
}

export { EventService, QueueMap };
