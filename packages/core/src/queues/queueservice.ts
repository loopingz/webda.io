import { ServiceParameters } from "../services/serviceparameters.js";
import {
  CancelableLoopPromise,
  CancelablePromise,
  WaitDelayer,
  WaitDelayerDefinition,
  WaitDelayerFactories
} from "@webda/utils";
import { PubSubService } from "./pubsubservice.js";

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
  workerParallelism: boolean = true;
  /**
   * Max number of queue consumers
   * Queue will auto increase to this max number if queue is loaded
   * and it will decrease to just one consumer if no messages are available
   *
   * @default 10
   */
  maxConsumers: number = 10;
  /**
   * Delayer between two receives of the main consumer while the queue returns no message
   *
   * Queues answering immediately when empty (PostgresQueue, AMQPQueue...) would otherwise be polled in a tight
   * loop. The delay grows with the consecutive empty receives, up to `maxIdleDelay`; the time spent in the receive
   * is deducted, so long-polling queues (SQSQueue, FileQueue, MemoryQueue with a timeout) are not slowed down.
   *
   * @default { "type": "exponential", "interval": 50 }
   */
  idleDelayer?: WaitDelayerDefinition;
  /**
   * Maximum delay between two receives while the queue stays empty, in milliseconds
   *
   * It bounds the extra latency of the first message after an idle period, and the polling rate of an idle
   * consumer (4 receives per second at 250ms).
   *
   * @default 250
   */
  maxIdleDelay?: number;
}

/**
 * Default delayer between two receives returning no message
 */
const DEFAULT_IDLE_DELAYER: WaitDelayerDefinition = { type: "exponential", interval: 50 };
/**
 * Default maximum delay between two receives returning no message, in milliseconds
 */
const DEFAULT_MAX_IDLE_DELAY = 250;

/**
 * AbstractQueue implements the worker system
 *
 * A Consumer allows you to define how to process message from
 * the queue, implementing the retries policy
 *
 * @category CoreServices
 */
abstract class Queue<T = any, K extends QueueParameters = QueueParameters> extends PubSubService<T, K> {
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
  /**
   * Delayer between two receives returning no message
   */
  protected idleDelayer: WaitDelayer;
  eventPrototype: new () => T;

  /**
   * Receive one or several messages
   */
  abstract receiveMessage<L>(proto?: { new (): L }): Promise<MessageReceipt<L>[]>;

  /**
   * Delete one message based on its receipt
   * @param id
   */
  abstract deleteMessage(id: string): Promise<void>;

  /**
   * Create the delayer
   * @returns this for chaining
   */
  public resolve(): this {
    super.resolve();
    this.delayer = WaitDelayerFactories.get(this.parameters.workerDelayer);
    this.idleDelayer = WaitDelayerFactories.get(this.parameters.idleDelayer ?? DEFAULT_IDLE_DELAYER);
    return this;
  }

  /**
   * Receive and process message from the queue
   *
   * @returns the result
   */
  protected async consumerReceiveMessage(): Promise<{
    speed: number;
    items: number;
  }> {
    try {
      let speed = Date.now();
      const items = await this.receiveMessage(this.eventPrototype);
      this.metrics.messages_received.inc(items.length);
      speed = Date.now() - speed;
      this.failedIterations = 0;
      if (items.length === 0) {
        return { speed, items: items.length };
      }
      const msgWorker = async msg => {
        const end = this.metrics.processing_duration.startTimer();
        try {
          await this.callback(msg.Message);
          await this.deleteMessage(msg.ReceiptHandle);
        } catch (err) {
          this.metrics.errors.inc();
          this.log("ERROR", `Message ${msg.ReceiptHandle}`, err);
        } finally {
          end();
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
   * Delay before the next receive after consecutive receives returned no message, before the `maxIdleDelay` cap
   *
   * @param emptyReceives - number of consecutive empty receives, starting at 1
   * @returns the delay in milliseconds
   */
  getIdleDelay(emptyReceives: number): number {
    this.idleDelayer ??= WaitDelayerFactories.get(this.parameters.idleDelayer ?? DEFAULT_IDLE_DELAYER);
    return this.idleDelayer(emptyReceives);
  }

  /**
   * Return the max consumers for the queue
   *
   * It is overridable so if a queue can retrieve several message at once
   * it can just use the worker // and several messages at once
   *
   * SQS for example will return this.parameters.maxConsumers / 10
   *
   * @returns the result number
   */
  getMaxConsumers(): number {
    return this.parameters.maxConsumers;
  }

  /**
   * Work a queue calling the callback with every Event received
   * If the callback is called without exception the `deleteMessage` is called
   * @param callback - the callback function
   * @param eventPrototype - the event prototype
   * @returns the result
   */
  consume(callback: (event: T) => Promise<void>, eventPrototype?: { new (): T }): CancelablePromise {
    this.failedIterations = 0;
    this.callback = callback;
    this.eventPrototype = eventPrototype;
    const consumers = new Set<CancelableLoopPromise>();
    let emptyReceives = 0;
    let idle: { timer: NodeJS.Timeout; resolve: () => void } | undefined;
    const idleWait = (ms: number) =>
      new Promise<void>(resolve => {
        idle = { timer: setTimeout(resolve, ms), resolve };
      }).finally(() => {
        idle = undefined;
      });
    const childQueueCallback = async (canceller: () => Promise<void>) => {
      const res = await this.consumerReceiveMessage();
      // If an error occured or no results found, stop the child
      if (res.items <= 0) {
        await canceller();
      }
    };
    const parentQueueCallback = async (_canceller: () => Promise<void>) => {
      const res = await this.consumerReceiveMessage();
      if (res.items === 0) {
        // Do not poll an empty queue in a tight loop: wait, minus the time the receive already waited
        emptyReceives++;
        const wait = Math.min(this.parameters.maxIdleDelay ?? DEFAULT_MAX_IDLE_DELAY, this.getIdleDelay(emptyReceives));
        if (wait - res.speed > 0) {
          await idleWait(wait - res.speed);
        }
        return;
      }
      emptyReceives = 0;
      if (res.items > 0 && res.speed < 3000 && consumers.size < this.getMaxConsumers() - 1) {
        this.log("TRACE", `Launching a new queue consumer for ${this.getName()}`);
        const consumer = new CancelableLoopPromise(childQueueCallback);
        // Add consumer to our list
        consumers.add(consumer);
        // Remove consumer once finished
        consumer.finally(() => {
          consumers.delete(consumer);
        });
      }
    };
    return new CancelableLoopPromise(parentQueueCallback, async () => {
      // Stop waiting for the next receive
      if (idle) {
        clearTimeout(idle.timer);
        idle.resolve();
      }
      await Promise.all(Array.from(consumers).map(c => c.cancel()));
    });
  }
}

export { Queue };
