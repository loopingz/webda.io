import { Queue, Service, ServiceParameters, useDynamicService, useRepository } from "@webda/core";
import type { ModelClass } from "@webda/core";

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

  /**
   * @param service - the emitter: a service, a model class or its serialized name
   * @param type - the event type
   * @param payload - the event payload
   */
  constructor(service: string | Service | ModelClass, type: string, payload: any = {}) {
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
   * @returns the serializable event
   */
  toJSON() {
    return {
      ...this,
      payload: JSON.stringify(this.payload, function serviceReplacer(this: any, key: string, value: any) {
        // Service.toJSON is applied before the replacer, check the raw value
        const raw = key === "" ? value : this[key];
        if (raw instanceof Service) {
          return `${AsyncEvent.ServiceTag}${raw.getName()}`;
        }
        return value;
      })
    };
  }

  /**
   * Deserialize from the queue, reviving any detected service
   *
   * @param data - the serialized event
   * @returns the event
   */
  static fromQueue(data: any) {
    const evt = new AsyncEvent(
      data.service,
      data.type,
      JSON.parse(data.payload, (_key: string, value: any) => {
        if (typeof value === "string" && value.startsWith(AsyncEvent.ServiceTag)) {
          return useDynamicService(value.substring(AsyncEvent.ServiceTag.length));
        }
        return value;
      })
    );
    evt.time = data.time;
    return evt;
  }

  /**
   * Mapper name
   * @returns the mapper key
   */
  getMapper() {
    return this.service + "_" + this.type;
  }
}

/**
 * Queues by name
 */
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
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.queues ??= {};
    this.sync ??= false;
    return this;
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
   * Resolve the queues
   * @returns this
   */
  resolve(): this {
    super.resolve();
    Object.keys(this.parameters.queues).forEach(key => {
      // Define default as first queue
      if (!this._defaultQueue) {
        this._defaultQueue = key;
      }
      this._queues[key] = useDynamicService<Queue>(this.parameters.queues[key]);
    });

    this._async = !this.parameters.sync;
    // Check we have at least one queue to handle asynchronous
    if (this._async && Object.keys(this._queues).length < 1) {
      this.log("ERROR", "Need at least one queue for async to be ready", this.parameters);
      throw Error("Need at least one queue for async to be ready");
    }
    return this;
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
   * @param service - the service or model class emitting the event
   * @param event - the event name
   * @param callback - the listener
   * @param queue - the queue to use, default queue if not specified
   */
  bindAsyncListener(service: Service | ModelClass, event: string, callback, queue?: string) {
    if (!this._async) {
      throw Error("EventService is not configured for asynchronous");
    }
    if (!queue) {
      queue = this._defaultQueue;
    }
    const mapper = new AsyncEvent(service, event).getMapper();
    if (!this._callbacks[mapper]) {
      if (service instanceof Service) {
        service.on(<never>event, data => this.pushEvent(service, event, queue, data));
      } else {
        (<any>useRepository(service)).on(event, data => this.pushEvent(service, event, queue, data));
      }
      this._callbacks[mapper] = [];
    }
    this._callbacks[mapper].push(callback);
  }

  /**
   * Synchronous Listener to proxy to async
   *
   * @param service - the emitter
   * @param type - the event type
   * @param queue - the queue to use
   * @param payload - the event payload
   * @returns the send or handle promise
   */
  async pushEvent(service: Service | ModelClass, type: string, queue: string, payload: any) {
    const event = new AsyncEvent(service, type, payload);
    if (this._async) {
      return this._queues[queue].sendMessage(event);
    } else {
      return this.handleEvent(event);
    }
  }

  /**
   * Process one event
   *
   * @param event - the event
   * @returns a promise resolved once all listeners are done
   */
  protected async handleEvent(event: AsyncEvent): Promise<void> {
    if (!this._callbacks[event.getMapper()]) {
      return Promise.reject(
        "Callbacks should not be empty, possible application version mismatch between emitter and worker"
      );
    }
    const promises = [];
    this._callbacks[event.getMapper()].map(executor => {
      promises.push(executor(event.payload, event));
    });
    // Need to handle the failure
    await Promise.all(promises);
  }

  /**
   * Process a serialized event
   * @param event serialized event
   * @returns the handle promise
   */
  protected async handleRawEvent(event: AsyncEvent) {
    return this.handleEvent(AsyncEvent.fromQueue(event));
  }

  /**
   * Process asynchronous event on queue
   * @param queue - the queue to consume
   * @returns the consumer promise
   */
  worker(queue: string = this._defaultQueue): Promise<void> {
    // Avoid loops
    this._async = false;
    return this._queues[queue].consume(this.handleRawEvent.bind(this));
  }
}

export { EventService };
export type { QueueMap };
