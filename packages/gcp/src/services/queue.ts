import { Message, PubSub } from "@google-cloud/pubsub";
import { CancelablePromise, DeepPartial, MessageReceipt, Queue, QueueParameters } from "@webda/core";

/**
 * GCPQueue Parameters
 */
export class GCPQueueParameters extends QueueParameters {
  /**
   * Topic to use
   */
  topic: string;
  /**
   * Subscription to use for the queue
   *
   * All instances will use the same subscription to create a queue style pubsub
   */
  subscription: string;
  /**
   * Timeout when receiveMessage is used before returning empty result (in ms)
   *
   * If not define then no timeout is applied and receiveMessage can hang forever
   */
  timeout?: number;
}

/**
 * GCP Queue implementation on top of Pub/Sub
 *
 * @WebdaModda GoogleCloudQueue
 */
export default class GCPQueue<T = any, K extends GCPQueueParameters = GCPQueueParameters> extends Queue<T, K> {
  /**
   * Main api object
   */
  pubsub: PubSub;
  /**
   * Current project id, used for manual acknowledge of message based on just their ackId
   */
  projectId: Promise<string>;
  messages: { [key: string]: Message } = {};
  /**
   * @override
   */
  loadParameters(params: DeepPartial<K>): GCPQueueParameters {
    return new GCPQueueParameters(params);
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    this.pubsub = new PubSub();
    this.projectId = this.pubsub.auth.getProjectId();
    return this;
  }

  /**
   * The queue size is not available within this service
   *
   * @returns
   */
  async size(): Promise<0> {
    return 0;
  }

  /**
   * Acknowledge a message
   * @param id
   */
  async deleteMessage(id: string) {
    try {
      await this.messages[id].ackWithResponse();
      delete this.messages[id];
    } catch (err) {
      this.log("ERROR", `Error deleting message ${id}`, err);
    }
  }

  /**
   * Send a message to the queue
   * @param msg
   */
  async sendMessage(msg: T) {
    await this.pubsub.topic(this.parameters.topic).publishMessage({ data: Buffer.from(JSON.stringify(msg)) });
  }

  /**
   * Retrieve just one message from the queue
   * @param proto
   * @returns
   */
  async receiveMessage<L>(proto?: new () => L): Promise<MessageReceipt<L>[]> {
    let timeoutId;
    let errorHandler;
    let msgHandler;
    const subscription = this.pubsub.subscription(this.parameters.subscription, {
      flowControl: {
        maxMessages: 1
      }
    });
    try {
      return await new Promise<MessageReceipt<L>[]>((resolve, reject) => {
        if (this.parameters.timeout) {
          timeoutId = setTimeout(() => resolve([]), this.parameters.timeout);
        }
        errorHandler = err => {
          reject(err);
        };
        msgHandler = (message: Message) => {
          this.messages[message.ackId] = message;
          resolve([
            {
              Message: this.unserialize(message.data.toString(), proto),
              ReceiptHandle: message.ackId
            }
          ]);
        };
        subscription.on("error", errorHandler);
        subscription.on("message", msgHandler);
      });
    } finally {
      subscription.close();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Work a queue calling the callback with every Event received
   * If the callback is called without exception the `deleteMessage` is called
   * @param callback
   * @param eventPrototype
   */
  consume(callback: (event: T) => Promise<void>, eventPrototype?: { new (): T }): CancelablePromise {
    const subscription = this.pubsub.subscription(this.parameters.subscription, {
      flowControl: {
        maxMessages: this.getMaxConsumers()
      }
    });
    return new CancelablePromise(
      async () => {
        subscription.on("message", async (message: Message) => {
          try {
            await callback(this.unserialize(message.data.toString(), eventPrototype));
            await message.ackWithResponse();
          } catch (err) {
            this.log("ERROR", `Message ${message.ackId}`, err);
          }
        });
      },
      async () => {
        subscription.close();
      }
    );
  }
}

export { GCPQueue };
