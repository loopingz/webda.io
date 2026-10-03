import { PubSubService, ServiceParameters } from "@webda/core";
import { CancelablePromise, JSONUtils } from "@webda/utils";
import * as amqplib from "amqplib";

/**
 * Configuration for {@link AMQPPubSubService}
 */
export class AMQPPubSubParameters extends ServiceParameters {
  /**
   * AMQP connection url
   * @example "amqp://localhost:5672"
   */
  url: string;
  /**
   * Exchange name to publish to and consume from
   */
  channel: string;
  /**
   * Queue name used to subscribe, empty to let the broker generate one
   * @default ""
   */
  subscription?: string;
  exchange?: {
    /**
     * @default fanout
     */
    type?: string;
    /**
     * if true, the exchange will survive broker restarts.
     * @default true
     */
    durable?: boolean;
    /**
     * if true, messages cannot be published directly to the exchange
     * (i.e., it can only be the target of bindings, or possibly create messages ex-nihilo).
     * @default false
     */
    internal?: boolean;
    /**
     * if true, the exchange will be destroyed once the number of bindings for which it is the source drop to zero.
     * @default false
     */
    autoDelete?: boolean;
    /**
     * an exchange to send messages to if this exchange can’t route them to any queues.
     *
     * Specific to RabbitMQ
     */
    alternateExchange?: string;
    /**
     * any additional arguments that may be needed by an exchange
     */
    arguments?: any;
  };

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.exchange ??= {};
    this.exchange.type ??= "fanout";
    this.subscription ??= "";
    return this;
  }
}

/**
 * Pub/sub backed by an AMQP exchange
 *
 * @see https://www.rabbitmq.com/tutorials/tutorial-three-python.html
 * @WebdaModda AMQPPubSub
 */
export default class AMQPPubSubService<
  T = any,
  K extends AMQPPubSubParameters = AMQPPubSubParameters
> extends PubSubService<T, K> {
  channel: amqplib.Channel;
  conn: amqplib.ChannelModel;
  exchange: amqplib.Replies.AssertExchange;

  /**
   * @override
   * @param event - the event to publish
   * @param routingKey - the routing key to use
   */
  async sendMessage(event: T, routingKey: string = ""): Promise<void> {
    this.metrics.messages_sent.inc();
    this.channel.publish(this.parameters.channel, routingKey, Buffer.from(JSONUtils.stringify(event)));
  }

  /**
   * @override
   * @returns this service
   */
  async init(): Promise<this> {
    await super.init();
    this.conn = await amqplib.connect(this.parameters.url);
    this.channel = await this.conn.createChannel();
    const params = { ...this.parameters.exchange };
    delete params.type;
    this.exchange = await this.channel.assertExchange(
      this.parameters.channel,
      this.parameters.exchange?.type || "fanout",
      params
    );
    return this;
  }

  /**
   * Close the AMQP connection
   * @override
   */
  async stop(): Promise<void> {
    if (this.conn) {
      const conn = this.conn;
      this.conn = undefined;
      this.channel = undefined;
      await conn.close().catch(() => {
        /* already closed */
      });
    }
    await super.stop();
  }

  /**
   * Return queue size
   * @returns the number of messages in the subscription queue
   */
  async size(): Promise<number> {
    return (await this.channel.assertQueue(this.parameters.subscription)).messageCount;
  }

  /**
   * Work a queue calling the callback with every Event received
   * If the callback is called without exception the message is acknowledged
   * @param callback - invoked with each event received
   * @param eventPrototype - optional class to rehydrate JSON into
   * @param onBind - invoked once the subscription is bound
   * @returns a cancelable subscription handle
   */
  consume(
    callback: (event: T) => Promise<void>,
    eventPrototype?: { new (): T },
    onBind?: () => void
  ): CancelablePromise {
    let consumerTag: string;
    return new CancelablePromise(
      async (_resolve, reject) => {
        const queue = await this.channel.assertQueue(this.parameters.subscription, {
          exclusive: true,
          durable: false,
          autoDelete: true
        });
        await this.channel.bindQueue(queue.queue, this.parameters.channel, "*");
        consumerTag = (
          await this.channel.consume(queue.queue, async msg => {
            if (msg === null) {
              reject("Cancelled by server");
              return;
            }
            this.metrics.messages_received.inc();
            const end = this.metrics.processing_duration.startTimer();
            try {
              await callback(this.unserialize(msg?.content.toString() || "", eventPrototype));
              this.channel.ack(msg);
            } catch (err) {
              this.metrics.errors.inc();
              this.log("ERROR", `Message ${msg?.properties?.messageId}`, err);
            } finally {
              end();
            }
          })
        ).consumerTag;
        onBind?.();
      },
      async () => {
        if (consumerTag) {
          await this.channel?.cancel(consumerTag);
        }
      }
    );
  }
}

export { AMQPPubSubService };
