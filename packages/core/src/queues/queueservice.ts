import { Service, ServiceParameters } from "../services/service";
import { WaitDelayerDefinition, WaitDelayer, WaitDelayerFactories, CancelablePromise } from "../utils/waiter";

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
   * @inheritdoc
   */
  constructor(params: any) {
    super(params);
    this.workerParallelism ??= true;
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
  protected async consumerReceiveMessage() {
    try {
      let items = await this.receiveMessage(this.eventPrototype);
      this.failedIterations = 0;
      if (items.length === 0) {
        return;
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
    } catch (err) {
      this.failedIterations += 1;
      this.log("ERROR", err);
      return new Promise(resolve => setTimeout(resolve, this.delayer(this.failedIterations)));
    }
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
    let cancelled = false;
    return new CancelablePromise(
      async () => {
        while (!cancelled) {
          await this.consumerReceiveMessage();
        }
      },
      () => {
        cancelled = true;
      }
    );
  }
}

export { Queue };
