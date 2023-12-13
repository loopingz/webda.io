import { CancelablePromise, JSONUtils, PubSubService, ServiceParameters } from "@webda/core";
import * as amqplib from "amqplib";

export class AMQPPubSubParameters extends ServiceParameters {
  url: string;
  channel: string;
  /**
   * @default ""
   * @SchemaOptional
   */
  subscription: string;
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

  constructor(params: Partial<AMQPPubSubParameters>) {
    super(params);
    this.exchange ??= {};
    this.exchange.type ??= "fanout";
    this.subscription ??= "";
  }
}

/**
 *
 * @see https://www.rabbitmq.com/tutorials/tutorial-three-python.html
 * @WebdaModda AMQPPubSub
 */
export default class AMQPPubSubService<
  T = any,
  K extends AMQPPubSubParameters = AMQPPubSubParameters
> extends PubSubService<T, K> {
  channel: amqplib.Channel;
  conn: amqplib.Connection;
  exchange: any;

  /**
   * @override
   */
  loadParameters(params: any) {
    return new AMQPPubSubParameters(params);
  }

  /**
   * @override
   */
  async sendMessage(event: T, routingKey: string = ""): Promise<void> {
    this.metrics.messages_sent.inc();
    await this.channel.publish(this.parameters.channel, routingKey, Buffer.from(JSONUtils.stringify(event)));
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    this.conn = await amqplib.connect(this.parameters.url);
    this.channel = await this.conn.createChannel();
    let params = { ...this.parameters.exchange };
    delete params.type;
    this.exchange = await this.channel.assertExchange(
      this.parameters.channel,
      this.parameters.exchange?.type || "fanout",
      params
    );
    return this;
  }

  /**
   * Return queue size
   * @returns
   */
  async size(): Promise<number> {
    return (await this.channel.assertQueue(this.parameters.subscription)).messageCount;
  }

  /**
   * Work a queue calling the callback with every Event received
   * If the callback is called without exception the `deleteMessage` is called
   * @param callback
   * @param eventPrototype
   */
  consume(
    callback: (event: T) => Promise<void>,
    eventPrototype?: { new (): T },
    onBind?: () => void
  ): CancelablePromise {
    let consumerTag: string;
    return new CancelablePromise(
      async (_resolve, reject) => {
        let queue = await this.channel.assertQueue(this.parameters.subscription, {
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
              await this.channel.ack(msg);
            } catch (err) {
              this.metrics.errors.inc();
              this.getWebda().log("ERROR", `Message ${msg?.properties?.messageId}`, err);
            } finally {
              end();
            }
          })
        ).consumerTag;
        if (onBind) {
          onBind();
        }
      },
      async () => {
        if (consumerTag) {
          this.channel.cancel(consumerTag);
        }
      }
    );
  }
}

export { AMQPPubSubService };
