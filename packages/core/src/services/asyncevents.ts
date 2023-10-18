import { CoreModelDefinition } from "../models/coremodel";
import { Queue } from "../queues/queueservice";
import { Service, ServiceParameters } from "./service";

/**
 * AsyncEvent representation
 */
export class AsyncEvent {
  /**
   * Service emitted the event
   */
  service: string;
  /**
   * Type of event
   */
  type: string;
  /**
   * Payload of the event
   */
  payload: any;
  /**
   * Time
   */
  time: Date;

  /**
   * Used when serializing a service
   */
  static ServiceTag = "#Webda:Service:";

  constructor(service: string | Service | CoreModelDefinition, type, payload = {}) {
    if (service instanceof Service) {
      this.service = `service:${service.getName()}`;
    } else if (typeof service === "string") {
      this.service = service;
    } else {
      this.service = `model:${service.name}`;
    }
    this.type = type;
    this.payload = payload;
    this.time = new Date();
  }

  /**
   * Allow payload to contain Service but do not serialize them
   * replacing them by a #Webda:Service:${service.getName()} so it
   * can be revived
   *
   * @returns
   */
  toJSON() {
    return {
      ...this,
      payload: JSON.stringify(this.payload, (_key: string, value: any) => {
        if (value instanceof Service) {
          return `${AsyncEvent.ServiceTag}${value.getName()}`;
        }
        return value;
      })
    };
  }

  /**
   * Deserialize from the queue, reviving any detected service
   *
   * @param data
   * @param service
   * @returns
   */
  static fromQueue(data: any, service: Service) {
    let evt = new AsyncEvent(
      data.service,
      data.type,
      JSON.parse(data.payload, (_key: string, value: any) => {
        if (typeof value === "string" && value.startsWith(AsyncEvent.ServiceTag)) {
          return service.getService(value.substring(AsyncEvent.ServiceTag.length));
        }
        return value;
      })
    );
    evt.time = data.time;
    return evt;
  }

  /**
   * Mapper name
   * @returns
   */
  getMapper() {
    return this.service + "_" + this.type;
  }
}

interface QueueMap {
  [key: string]: Queue;
}

/**
 * @inheritdoc
 */
export class EventServiceParameters extends ServiceParameters {
  /**
   * Queues to post async events to
   */
  queues?: { [key: string]: string };
  /**
   * Make the event sending asynchronous
   */
  sync?: boolean;

  /**
   * @inheritdoc
   */
  constructor(params: any) {
    super(params);
    this.queues ??= {};
    this.sync ??= false;
  }
}

/**
 * @category CoreServices
 * @WebdaModda AsyncEvents
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
    Object.keys(this.parameters.queues).forEach(key => {
      // Define default as first queue
      if (!this._defaultQueue) {
        this._defaultQueue = key;
      }
      this._queues[key] = this.getService<Queue>(this.parameters.queues[key]);
    });

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
  bindAsyncListener(service: Service | CoreModelDefinition, event: string, callback, queue?: string) {
    if (!this._async) {
      throw Error("EventService is not configured for asynchronous");
    }
    if (!queue) {
      queue = this._defaultQueue;
    }
    let mapper = new AsyncEvent(service, event).getMapper();
    if (!this._callbacks[mapper]) {
      if (service instanceof Service) {
        service.on(event, data => this.pushEvent(service, event, queue, data));
      } else {
        service.on(<any>event, data => this.pushEvent(service, event, queue, data));
      }
      this._callbacks[mapper] = [];
    }
    this._callbacks[mapper].push(callback);
  }

  /**
   * Synchronous Listener to proxy to async
   *
   * @param service
   * @param type
   * @param queue
   * @param payload
   * @returns
   */
  async pushEvent(service: Service | CoreModelDefinition, type: string, queue: string, payload: any) {
    let event = new AsyncEvent(service, type, payload);
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
  protected async handleEvent(event: AsyncEvent): Promise<void> {
    if (!this._callbacks[event.getMapper()]) {
      return Promise.reject(
        "Callbacks should not be empty, possible application version mismatch between emitter and worker"
      );
    }
    let promises = [];
    this._callbacks[event.getMapper()].map(executor => {
      promises.push(executor(event.payload, event));
    });
    // Need to handle the failure
    await Promise.all(promises);
  }

  /**
   *
   * @param eventBody serialized event
   * @returns
   */
  protected async handleRawEvent(event: AsyncEvent) {
    return this.handleEvent(AsyncEvent.fromQueue(event, this));
  }

  /**
   * Process asynchronous event on queue
   * @param queue
   * @returns
   */
  worker(queue: string = this._defaultQueue): Promise<void> {
    // Avoid loops
    this._async = false;
    return this._queues[queue].consume(this.handleRawEvent.bind(this));
  }
}

export { EventService, QueueMap };
