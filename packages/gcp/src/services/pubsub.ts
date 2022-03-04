import { CancelablePromise, PubSubService, ServiceParameters } from "@webda/core";
import { PubSub, CreateSubscriptionOptions, Subscription, Message } from "@google-cloud/pubsub";

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
 */
export default class GCPPubSubService<
  T = any,
  K extends GCPPubSubParameters = GCPPubSubParameters
> extends PubSubService<T, K> {
  pubsub: PubSub;

  /**
   * @override
   */
  async init() {
    await super.init();
    this.pubsub = new PubSub();
  }

  /**
   * @override
   */
  async sendMessage(event: T): Promise<void> {
    await this.pubsub.topic(this.parameters.topic).publishMessage({ data: Buffer.from(JSON.stringify(event)) });
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
        await callback(this.unserialize(message.data.toString(), eventPrototype));
        message.ack();
      } catch (err) {
        this.log("ERROR", `${this.getName()} consume message error`, err);
      }
    };
    return new CancelablePromise<void>(
      async (resolve, reject) => {
        try {
          subscription = this.pubsub.subscription(subscriptionName);
          const [result] = await this.pubsub
            .topic(this.parameters.topic)
            .createSubscription(subscriptionName, this.parameters.subscriptionOptions);
          subscription = result;

          // Receive callbacks for new messages on the subscription
          subscription.on("message", messageHandler);

          // Receive callbacks for errors on the subscription
          subscription.on("error", error => {
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

  /**
   * @override
   */
  static getModda() {
    return {
      uuid: "Webda/GoogleCloudPubSub",
      label: "GCP PubSub",
      description: "Implements a PubSub stored in GCP",
    };
  }
}

export { GCPPubSubService };
