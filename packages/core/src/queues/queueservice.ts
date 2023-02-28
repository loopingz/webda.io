import { Counter, Gauge, Histogram } from "../core";
import { ServiceParameters } from "../services/service";
import {
  CancelableLoopPromise,
  CancelablePromise,
  WaitDelayer,
  WaitDelayerDefinition,
  WaitDelayerFactories,
} from "../utils/waiter";
import { PubSubService } from "./pubsubservice";

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
abstract class Queue<
  T = any,
  K extends QueueParameters = QueueParameters
> extends PubSubService<T, K> {
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

  metrics: {
    size: Gauge;
    consumed: Counter;
    errors: Counter;
    processing_duration: Histogram;
  };

  initMetrics() {
    super.initMetrics();
    this.metrics.size = this.getMetric(Gauge, {
      name: "queue_size",
      help: "Number of item in the queue",
      collect: async () => {
        this.metrics.size.set(await this.size());
      },
    });
    this.metrics.consumed = this.getMetric(Gauge, {
      name: "queue_consumed",
      help: "Number of item consumed by the queue",
    });
    this.metrics.errors = this.getMetric(Gauge, {
      name: "queue_errors",
      help: "Number of item in error",
    });
    this.metrics.processing_duration = this.getMetric(Histogram, {
      name: "queue_processing_duration",
      help: "Time to consume an item",
    });
  }

  /**
   * Receive one or several messages
   */
  abstract receiveMessage<L>(proto?: {
    new (): L;
  }): Promise<MessageReceipt<L>[]>;

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
  public resolve(): this {
    super.resolve();
    this.delayer = WaitDelayerFactories.get(this.parameters.workerDelayer);
    return this;
  }

  /**
   * Receive and process message from the queue
   *
   * @returns
   */
  protected async consumerReceiveMessage(): Promise<{
    speed: number;
    items: number;
  }> {
    try {
      let speed = Date.now();
      let items = await this.receiveMessage(this.eventPrototype);
      this.metrics.consumed.inc(items.length);
      speed = Date.now() - speed;
      this.failedIterations = 0;
      if (items.length === 0) {
        return { speed, items: items.length };
      }
      const msgWorker = async (msg) => {
        const end = this.metrics.processing_duration.startTimer();
        try {
          await this.callback(msg.Message);
          await this.deleteMessage(msg.ReceiptHandle);
          end();
        } catch (err) {
          end();
          this.metrics.errors.inc();
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
      await new Promise((resolve) =>
        setTimeout(resolve, this.delayer(this.failedIterations))
      );
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
  consume(
    callback: (event: T) => Promise<void>,
    eventPrototype?: { new (): T }
  ): CancelablePromise {
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
    let parentQueueCallback = async (_canceller: () => Promise<void>) => {
      let res = await this.consumerReceiveMessage();
      if (
        res.items > 0 &&
        res.speed < 3000 &&
        consumers.size < this.getMaxConsumers() - 1
      ) {
        this.log(
          "TRACE",
          `Launching a new queue consumer for ${this.getName()}`
        );
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
      await Promise.all(Array.from(consumers).map((c) => c.cancel()));
    });
  }
}

export { Queue };
