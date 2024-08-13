import { Message, PubSub, Subscription } from "@google-cloud/pubsub";
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
  /**
   * If receiver, the usage is to call receiveMessage and deleteMessage manually
   * If consumer, the usage is to call consume, the normal flow is used in parallel
   */
  mode: "consumer" | "receiver" = "consumer";
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
   * Current subscription
   */
  subscription: Subscription;
  /**
   * Pending message
   *
   * Used in receiver mode to store the next message received
   */
  private receiverPromise?: Promise<MessageReceipt<any>[]>;
  private receiverResolve?: (value: MessageReceipt<any>[]) => void;
  /**
   *
   */
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
    await this.messages[id].ackWithResponse();
    delete this.messages[id];
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
    if (this.parameters.mode !== "receiver") {
      throw new Error("You can only use receiveMessage in 'receiver' mode");
    }
    this.subscription ??= this.pubsub.subscription(this.parameters.subscription, {
      flowControl: {
        maxMessages: 1,
        allowExcessMessages: false
      }
    });
    this.receiverPromise ??= new Promise<MessageReceipt<L>[]>((resolve, _) => {
      this.receiverResolve = resolve;
    });
    let result = this.receiverPromise;
    this.receiverPromise = undefined;
    if (this.subscription.listenerCount("message") === 0) {
      const msgHandler = (message: Message) => {
        this.messages[message.ackId] = message;
        const resolve = this.receiverResolve;

        this.receiverPromise ??= new Promise<MessageReceipt<L>[]>((res, _) => {
          this.receiverResolve = res;
        });
        resolve([
          {
            Message: message.data.toString(),
            ReceiptHandle: message.ackId
          }
        ]);
      };
      this.subscription.on("error", err => {
        this.log("ERROR", "Error in receiver", err);
      });
      this.subscription.on("message", msgHandler);
    }
    if (this.parameters.timeout) {
      timeoutId = setTimeout(() => {
        const resolve = this.receiverResolve;
        this.receiverPromise ??= new Promise<MessageReceipt<L>[]>((res, _) => {
          this.receiverResolve = res;
        });
        resolve([]);
      }, this.parameters.timeout);
    }
    return result
      .finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      })
      .then(res => {
        // Unserialize the message
        return res.map(r => {
          return {
            ...r,
            Message: this.unserialize(r.Message, proto)
          };
        });
      });
  }

  /**
   * Work a queue calling the callback with every Event received
   * If the callback is called without exception the `deleteMessage` is called
   * @param callback
   * @param eventPrototype
   */
  consume(callback: (event: T) => Promise<void>, eventPrototype?: { new (): T }): CancelablePromise {
    this.subscription ??= this.pubsub.subscription(this.parameters.subscription, {
      flowControl: {
        maxMessages: this.getMaxConsumers()
      }
    });
    const msgHandler = async (message: Message) => {
      try {
        await callback(this.unserialize(message.data.toString(), eventPrototype));
        await message.ackWithResponse();
      } catch (err) {
        this.log("ERROR", `Message ${message.ackId}`, err);
      }
    };
    return new CancelablePromise(
      async () => {
        this.subscription.on("message", msgHandler);
      },
      async () => {
        this.subscription.removeListener("message", msgHandler);
      }
    );
  }
}

export { GCPQueue };
