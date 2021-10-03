import { MessageReceipt, Queue, QueueParameters, JSONUtils } from "@webda/core";
import * as amqplib from "amqplib";

class AMQPQueueParameters extends QueueParameters {
  url: string;
  queue: string;
}

export default class AMQPQueue<T = any, K extends AMQPQueueParameters = AMQPQueueParameters> extends Queue<T, K> {
  channel: any;
  conn: any;
  /**
   * @override
   */
  loadParameters(params: any) {
    return new AMQPQueueParameters(params);
  }

  /**
   * @override
   */
  async init() {
    await super.init();
    this.conn = await amqplib.connect(this.parameters.url);
    this.channel = await this.conn.createChannel();
    await this.channel.assertQueue(this.parameters.queue);
  }

  /**
   * @override
   */
  async sendMessage(event: T): Promise<void> {
    await this.channel.sendToQueue(this.parameters.queue, Buffer.from(JSONUtils.stringify(event)));
  }

  /**
   * @override
   */
  async receiveMessage<L>(proto?: new () => L): Promise<MessageReceipt<L>[]> {
    let msg = await this.channel.get(this.parameters.queue);
    if (msg === false) {
      return [];
    }
    return [
      {
        ReceiptHandle: msg,
        Message: this.unserialize(msg.content.toString(), proto)
      }
    ];
  }

  /**
   * @override
   */
  async deleteMessage(id: string): Promise<void> {
    await this.channel.ack(id);
  }

  /**
   * @override
   */
  async size(): Promise<number> {
    return (await this.channel.assertQueue(this.parameters.queue)).messageCount;
  }

  async ___cleanData() {
    await this.channel.purgeQueue(this.parameters.queue);
  }

  /**
   * @override
   */
  static getModda() {
    return {
      uuid: "Webda/AMQPQueue",
      label: "AMQP Queue",
      description: "Implements a Queue stored in AMQP"
    };
  }
}
