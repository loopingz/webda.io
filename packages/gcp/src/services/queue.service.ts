import { Message, PubSub, Subscription } from "@google-cloud/pubsub";
import { MessageReceipt, Queue, QueueParameters } from "@webda/core";
import { CancelablePromise, JSONUtils } from "@webda/utils";

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
   *
   * @default "consumer"
   */
  mode?: "consumer" | "receiver";

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.mode ??= "consumer";
    return this;
  }
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
   * Messages received and not yet acknowledged, indexed by ackId
   */
  messages: { [key: string]: Message } = {};

  /**
   * @override
   * @returns this service
   */
  async init(): Promise<this> {
    await super.init();
    this.pubsub = new PubSub();
    return this;
  }

  /**
   * Close the subscription and the Pub/Sub client
   * @override
   */
  async stop(): Promise<void> {
    if (this.subscription) {
      this.subscription.removeAllListeners();
      await this.subscription.close().catch(() => {
        /* already closed */
      });
      this.subscription = undefined;
    }
    if (this.pubsub) {
      const pubsub = this.pubsub;
      this.pubsub = undefined;
      await pubsub.close().catch(() => {
        /* already closed */
      });
    }
    await super.stop();
  }

  /**
   * The queue size is not available within this service
   *
   * @returns 0
   */
  async size(): Promise<number> {
    return 0;
  }

  /**
   * Acknowledge a message
   * @param id - the ackId returned by {@link receiveMessage}
   */
  async deleteMessage(id: string): Promise<void> {
    await this.messages[id].ackWithResponse();
    delete this.messages[id];
  }

  /**
   * Send a message to the queue
   * @param msg - the message to send
   */
  async sendMessage(msg: T): Promise<void> {
    this.metrics.messages_sent.inc();
    await this.pubsub.topic(this.parameters.topic).publishMessage({ data: Buffer.from(JSONUtils.stringify(msg)) });
  }

  /**
   * Prepare the next receiver promise
   * @returns the resolver of the current pending promise
   */
  private nextReceiver<L>(): (value: MessageReceipt<L>[]) => void {
    const resolve = this.receiverResolve;
    this.receiverPromise ??= new Promise<MessageReceipt<L>[]>(res => {
      this.receiverResolve = res;
    });
    return resolve;
  }

  /**
   * Retrieve just one message from the queue
   * @param proto - optional prototype to rehydrate the payload into
   * @returns the received messages, empty if the timeout expired
   */
  async receiveMessage<L>(proto?: new () => L): Promise<MessageReceipt<L>[]> {
    let timeoutId: NodeJS.Timeout;
    if (this.parameters.mode !== "receiver") {
      throw new Error("You can only use receiveMessage in 'receiver' mode");
    }
    this.subscription ??= this.pubsub.subscription(this.parameters.subscription, {
      flowControl: {
        maxMessages: 1,
        allowExcessMessages: false
      }
    });
    this.receiverPromise ??= new Promise<MessageReceipt<L>[]>(resolve => {
      this.receiverResolve = resolve;
    });
    const result = this.receiverPromise;
    this.receiverPromise = undefined;
    if (this.subscription.listenerCount("message") === 0) {
      const msgHandler = (message: Message) => {
        this.messages[message.ackId] = message;
        this.metrics.messages_received.inc();
        this.nextReceiver()([
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
        this.nextReceiver()([]);
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
            Message: this.unserialize(<string>(<unknown>r.Message), proto)
          };
        });
      });
  }

  /**
   * Work a queue calling the callback with every Event received
   * If the callback is called without exception the message is acknowledged
   * @param callback - invoked with each event received
   * @param eventPrototype - optional class to rehydrate JSON into
   * @returns a cancelable consumer handle
   */
  consume(callback: (event: T) => Promise<void>, eventPrototype?: { new (): T }): CancelablePromise {
    this.subscription ??= this.pubsub.subscription(this.parameters.subscription, {
      flowControl: {
        maxMessages: this.getMaxConsumers()
      }
    });
    const msgHandler = async (message: Message) => {
      this.metrics.messages_received.inc();
      try {
        await callback(this.unserialize(message.data.toString(), eventPrototype));
        await message.ackWithResponse();
      } catch (err) {
        this.metrics.errors.inc();
        this.log("ERROR", `Message ${message.ackId}`, err);
      }
    };
    return new CancelablePromise(
      async () => {
        this.subscription.on("message", msgHandler);
      },
      async () => {
        this.subscription?.removeListener("message", msgHandler);
      }
    );
  }
}

export { GCPQueue };
