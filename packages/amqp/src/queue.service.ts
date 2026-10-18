import { MessageReceipt, Queue, QueueParameters, SecretString, WebdaError } from "@webda/core";
import { JSONUtils } from "@webda/utils";
import * as amqplib from "amqplib";

/**
 * Configuration for {@link AMQPQueue}
 */
export class AMQPQueueParameters extends QueueParameters {
  /**
   * AMQP connection url
   *
   * Can be encrypted with `webda config encrypt`
   * @example "amqp://localhost:5672"
   */
  url: string | SecretString;
  /**
   * Queue name
   */
  queue: string;
  /**
   * Options passed to assertQueue
   */
  queueOptions?: any;
}

/**
 * Implements a Queue stored in AMQP
 *
 * @WebdaModda
 */
export default class AMQPQueue<T = any, K extends AMQPQueueParameters = AMQPQueueParameters> extends Queue<T, K> {
  channel?: amqplib.Channel;
  conn?: amqplib.ChannelModel;

  /**
   * @returns the active AMQP channel
   * @throws CodeError when the service is not connected
   */
  protected getChannel(): amqplib.Channel {
    if (!this.channel) {
      throw new WebdaError.CodeError("AMQP_NOT_CONNECTED", "AMQP service is not connected");
    }
    return this.channel;
  }

  /**
   * @override
   * @returns this service
   */
  async init(): Promise<this> {
    await super.init();
    this.conn = await amqplib.connect(SecretString.unwrap(this.parameters.url) as string);
    this.channel = await this.conn.createChannel();
    await this.getChannel().assertQueue(this.parameters.queue, this.parameters.queueOptions);
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
   * @override
   * @param event - the event to enqueue
   */
  async sendMessage(event: T): Promise<void> {
    this.metrics.messages_sent.inc();
    this.getChannel().sendToQueue(this.parameters.queue, Buffer.from(JSONUtils.stringify(event)));
  }

  /**
   * @override
   * @param proto - optional prototype to rehydrate the payload into
   * @returns the received message if any
   */
  async receiveMessage<L>(proto?: new () => L): Promise<MessageReceipt<L>[]> {
    const msg = await this.getChannel().get(this.parameters.queue);
    if (msg === false) {
      return [];
    }
    return [
      {
        ReceiptHandle: <any>msg,
        Message: this.unserialize(msg.content.toString(), proto)
      }
    ];
  }

  /**
   * @override
   * @param id - the receipt handle returned by {@link receiveMessage}
   */
  async deleteMessage(id: string): Promise<void> {
    this.getChannel().ack(<any>id);
  }

  /**
   * @override
   * @returns the number of messages ready in the queue
   */
  async size(): Promise<number> {
    return (await this.getChannel().assertQueue(this.parameters.queue)).messageCount;
  }

  /**
   * Purge the queue, used by tests
   */
  async __clean(): Promise<void> {
    await this.getChannel().purgeQueue(this.parameters.queue);
  }
}

export { AMQPQueue };
