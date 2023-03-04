import {
  CreateSubscriptionOptions,
  Message,
  PubSub,
  Subscription,
} from "@google-cloud/pubsub";
import {
  CancelablePromise,
  PubSubService,
  ServiceParameters,
} from "@webda/core";

export class GCPPubSubParameters extends ServiceParameters {
  /**
   * Topic to use on GCP
   */
  topic: string;
  /**
   * Subscription options to pass to GCP
   */
  subscriptionOptions?: CreateSubscriptionOptions;
}

/***
 * Implement GCP Pub/Sub
 *
 * Can also act as queue
 *
 * @WebdaModda GoogleCloudPubSub
 */
export default class GCPPubSubService<
  T = any,
  K extends GCPPubSubParameters = GCPPubSubParameters
> extends PubSubService<T, K> {
  pubsub: PubSub;

  /**
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    this.pubsub = new PubSub();
    return this;
  }

  /**
   * @override
   */
  async sendMessage(event: T): Promise<void> {
    await this.pubsub
      .topic(this.parameters.topic)
      .publishMessage({ data: Buffer.from(JSON.stringify(event)) });
  }

  /**
   * @override
   */
  consume(
    callback: (event: T) => Promise<void>,
    eventPrototype?: new () => T,
    onBind?: (subscription: Subscription) => void
  ): CancelablePromise<void> {
    const subscriptionName = `${this.getName()}-${this.getWebda().getUuid()}`;
    let subscription: Subscription;
    const messageHandler = async (message: Message) => {
      try {
        await callback(
          this.unserialize(message.data.toString(), eventPrototype)
        );
        message.ack();
      } catch (err) {
        this.log("ERROR", `${this.getName()} consume message error`, err);
      }
    };
    return new CancelablePromise<void>(
      async (_resolve, reject) => {
        try {
          subscription = this.pubsub.subscription(subscriptionName);
          const [result] = await this.pubsub
            .topic(this.parameters.topic)
            .createSubscription(
              subscriptionName,
              this.parameters.subscriptionOptions
            );
          subscription = result;

          // Receive callbacks for new messages on the subscription
          subscription.on("message", messageHandler);

          // Receive callbacks for errors on the subscription
          subscription.on("error", (error) => {
            console.error("Received error:", error);
            reject(error);
          });
          if (onBind) {
            onBind(subscription);
          }
        } catch (err) {
          this.log("ERROR", `${this.getName()} consume error`, err);
          reject(err);
        }
      },
      async () => {
        if (subscription) {
          subscription.removeAllListeners();
          await subscription.delete();
        }
      }
    );
  }
}

export { GCPPubSubService };
