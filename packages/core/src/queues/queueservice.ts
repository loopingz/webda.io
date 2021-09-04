import { Service, ServiceParameters } from "../services/service";
import {
  WaitDelayerDefinition,
  WaitDelayer,
  WaitDelayerFactories,
  CancelablePromise,
  CancelableLoopPromise
} from "../utils/waiter";

/**
 * Raw message from queue
 */
export interface MessageReceipt<T = any> {
  /**
   * Message
   */
  Message: T;
  /**
   * Id of message to acknowledge
   */
  ReceiptHandle: string;
}

/**
 * @inheritdoc
 */
export class QueueParameters extends ServiceParameters {
  /**
   * Delayer between two failed attempts to process messages
   */
  workerDelayer?: WaitDelayerDefinition;
  /**
   * Define if worker should process multi message received in //
   * @default true
   */
  workerParallelism?: boolean;
  /**
   * Max number of queue consumers
   * Queue will auto increase to this max number if queue is loaded
   * and it will decrease to just one consumer if no messages are available
   *
   * @default 10
   */
  maxConsumers: number;

  /**
   * @inheritdoc
   */
  constructor(params: any) {
    super(params);
    this.workerParallelism ??= true;
    this.maxConsumers ??= 10;
  }
}

/**
 * AbstractQueue implements the worker system
 *
 * A Consumer allows you to define how to process message from
 * the queue, implementing the retries policy
 *
 * @category CoreServices
 */
abstract class Queue<T = any, K extends QueueParameters = QueueParameters> extends Service<K> {
  /**
   * Current timeout handler
   */
  protected _timeout: NodeJS.Timeout;
  /**
   * Callback function to call for each message
   */
  private callback: (event: T) => Promise<void>;
  /**
   * Current pause instance
   */
  protected failedIterations: number;
  /**
   * Delayer
   */
  protected delayer: WaitDelayer;
  eventPrototype: new () => T;

  /**
   * Send an event to the queue
   * @param event
   */
  abstract sendMessage(event: T): Promise<void>;

  /**
   * Receive one or several messages
   */
  abstract receiveMessage<L>(proto?: { new (): L }): Promise<MessageReceipt<L>[]>;

  /**
   * Unserialize into class
   * @param data
   * @param proto
   * @returns
   */
  unserialize<L>(data: string, proto?: { new (): L }): L {
    if (proto) {
      return Object.assign(new proto(), JSON.parse(data));
    }
    return JSON.parse(data);
  }

  /**
   * Delete one message based on its receipt
   * @param id
   */
  abstract deleteMessage(id: string): Promise<void>;

  /**
   * Return the size of the current queue
   */
  abstract size(): Promise<number>;

  /**
   * Create the delayer
   */
  public resolve() {
    super.resolve();
    this.delayer = WaitDelayerFactories.get(this.parameters.workerDelayer);
  }

  /**
   * Receive and process message from the queue
   *
   * @returns
   */
  protected async consumerReceiveMessage(): Promise<{ speed: number; items: number }> {
    try {
      let speed = Date.now();
      let items = await this.receiveMessage(this.eventPrototype);
      speed = Date.now() - speed;
      this.failedIterations = 0;
      if (items.length === 0) {
        return { speed, items: items.length };
      }
      const msgWorker = async msg => {
        try {
          await this.callback(msg.Message);
          await this.deleteMessage(msg.ReceiptHandle);
        } catch (err) {
          this.getWebda().log("ERROR", `Message ${msg.ReceiptHandle}`, err);
        }
      };
      if (this.parameters.workerParallelism) {
        // Parallelized processing
        await Promise.all(items.map(msgWorker));
      } else {
        // Serialized processing
        for (const item of items) {
          await msgWorker(item);
        }
      }
      return { speed, items: items.length };
    } catch (err) {
      this.failedIterations += 1;
      this.log("ERROR", err);
      await new Promise(resolve => setTimeout(resolve, this.delayer(this.failedIterations)));
      return { speed: 0, items: -1 };
    }
  }

  /**
   * Return the max consumers for the queue
   *
   * It is overridable so if a queue can retrieve several message at once
   * it can just use the worker // and several messages at once
   *
   * SQS for example will return this.parameters.maxConsumers / 10
   *
   * @returns
   */
  getMaxConsumers(): number {
    return this.parameters.maxConsumers;
  }

  /**
   * Work a queue calling the callback with every Event received
   * If the callback is called without exception the `deleteMessage` is called
   * @param callback
   * @param eventPrototype
   */
  consume(callback: (event: T) => Promise<void>, eventPrototype?: { new (): T }): CancelablePromise {
    this.failedIterations = 0;
    this.callback = callback;
    this.eventPrototype = eventPrototype;
    let consumers = new Set<CancelableLoopPromise>();
    let childQueueCallback = async (canceller: () => Promise<void>) => {
      let res = await this.consumerReceiveMessage();
      // If an error occured or no results found, stop the child
      if (res.items <= 0) {
        await canceller();
      }
    };
    let parentQueueCallback = async (canceller: () => Promise<void>) => {
      let res = await this.consumerReceiveMessage();
      if (res.items > 0 && res.speed < 3000 && consumers.size < this.getMaxConsumers() - 1) {
        this.log("TRACE", `Launching a new queue consumer for ${this.getName()}`);
        let consumer = new CancelableLoopPromise(childQueueCallback);
        // Add consumer to our list
        consumers.add(consumer);
        // Remove consumer once finished
        consumer.finally(() => {
          consumers.delete(consumer);
        });
      }
    };
    return new CancelableLoopPromise(parentQueueCallback, async () => {
      return Promise.all(Array.from(consumers).map(c => c.cancel()));
    });
  }
}

export { Queue };
