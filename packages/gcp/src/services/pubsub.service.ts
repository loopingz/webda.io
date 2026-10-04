import { CreateSubscriptionOptions, Message, PubSub, Subscription } from "@google-cloud/pubsub";
import { getMachineId, PubSubService, ServiceParameters } from "@webda/core";
import { CancelablePromise, JSONUtils } from "@webda/utils";

/**
 * Configuration for {@link GCPPubSubService}
 */
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

/**
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
   * @returns this service
   */
  async init(): Promise<this> {
    await super.init();
    this.pubsub = new PubSub();
    return this;
  }

  /**
   * Close the Pub/Sub client
   * @override
   */
  async stop(): Promise<void> {
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
   * @override
   * @param event - the event to publish
   */
  async sendMessage(event: T): Promise<void> {
    this.metrics.messages_sent.inc();
    await this.pubsub.topic(this.parameters.topic).publishMessage({ data: Buffer.from(JSONUtils.stringify(event)) });
  }

  /**
   * The size is not available on a GCP subscription
   * @returns 0
   */
  async size(): Promise<number> {
    return 0;
  }

  /**
   * Get the subscription name
   * @returns the subscription name, unique per machine
   */
  getSubscriptionName(): string {
    return `${this.getName()}-${getMachineId()}`;
  }

  /**
   * @override
   * @param callback - invoked with each event received
   * @param eventPrototype - optional class to rehydrate JSON into
   * @param onBind - invoked once the subscription is bound
   * @returns a cancelable subscription handle
   */
  consume(
    callback: (event: T) => Promise<void>,
    eventPrototype?: new () => T,
    onBind?: (subscription: Subscription) => void
  ): CancelablePromise<void> {
    const subscriptionName = this.getSubscriptionName();
    let subscription: Subscription;
    const messageHandler = async (message: Message) => {
      this.metrics.messages_received.inc();
      const end = this.metrics.processing_duration.startTimer();
      try {
        await callback(this.unserialize(message.data.toString(), eventPrototype));
        await message.ackWithResponse();
      } catch (err) {
        this.metrics.errors.inc();
        this.log("ERROR", `${this.getName()} consume message error`, err);
      } finally {
        end();
      }
    };
    return new CancelablePromise<void>(
      async (_resolve, reject) => {
        // Defer to the next tick: CancelablePromise cannot be rejected synchronously from its executor
        await Promise.resolve();
        try {
          subscription = this.pubsub.subscription(subscriptionName);
          const [exists] = await subscription.exists();
          if (!exists) {
            const [result] = await this.pubsub
              .topic(this.parameters.topic)
              .createSubscription(subscriptionName, this.parameters.subscriptionOptions);
            subscription = result;
          }

          // Receive callbacks for new messages on the subscription
          subscription.on("message", messageHandler);

          // Receive callbacks for errors on the subscription
          subscription.on("error", error => {
            this.log("ERROR", `${this.getName()} subscription error`, error);
            reject(error);
          });
          onBind?.(subscription);
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
