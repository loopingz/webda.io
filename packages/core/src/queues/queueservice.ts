import { Service, ServiceParameters } from "../services/service";
import { WaitDelayerDefinition, WaitDelayer, WaitDelayerFactories } from "../utils/waiter";

/**
 * Raw message from queue
 */
export interface MessageReceipt {
  /**
   * Serialized event
   */
  Body: string;
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
abstract class Queue<K = any, T extends QueueParameters = QueueParameters> extends Service<T> {
  /**
   * Current timeout handler
   */
  protected _timeout: NodeJS.Timeout;
  /**
   * Set to interrupt current worker loop
   */
  protected _interrupt: boolean;
  /**
   * Callback function to call for each message
   */
  private callback: (event: K) => Promise<void>;
  /**
   * Current pause instance
   */
  protected failedIterations: number;
  /**
   * Delayer
   */
  protected delayer: WaitDelayer;

  /**
   * Send an event to the queue
   * @param event
   */
  abstract sendMessage(event: K): Promise<void>;

  /**
   * Receive one or several messages
   */
  abstract receiveMessage(): Promise<MessageReceipt[]>;

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
   * Resume the work
   */
  protected async consumerResume() {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
    this._timeout = setTimeout(this.consumerReceiveMessage.bind(this), 1000);
  }

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
    if (this._interrupt) {
      return;
    }
    try {
      let items = await this.receiveMessage();
      this.failedIterations = 0;
      if (items.length === 0) {
        return this.consumerResume();
      }
      const msgWorker = async msg => {
        try {
          const event = <K>JSON.parse(msg.Body);
          await this.callback(event);
          await this.deleteMessage(msg.ReceiptHandle);
        } catch (err) {
          this.log("ERROR", `Message ${msg.ReceiptHandle}`, err);
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
      return this.consumerResume();
    } catch (err) {
      this.failedIterations += 1;
      this.log("ERROR", err);
      setTimeout(this.consumerReceiveMessage.bind(this), this.delayer(this.failedIterations));
    }
  }

  /**
   * Work a queue calling the callback with every Event received
   * If the callback is called without exception the `deleteMessage` is called
   * @param callback
   */
  async consume(callback: (event: K) => Promise<void>) {
    this.failedIterations = 0;
    this.callback = callback;
    while (!this._interrupt) {
      await this.consumerReceiveMessage();
    }
  }

  /**
   * Stop the worker
   */
  stop() {
    this._interrupt = true;
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
  }
}

export { Queue };
