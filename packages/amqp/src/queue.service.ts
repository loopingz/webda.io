import { MessageReceipt, Queue, QueueParameters, SecretString, WebdaError } from "@webda/core";
import { CancelablePromise, JSONUtils } from "@webda/utils";
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
  /**
   * Subscribe with `basic.consume` instead of polling with `basic.get`
   *
   * `consume()` opens its own channel with a prefetch of `maxConsumers`: the broker pushes the messages as they
   * arrive, at most `maxConsumers` being processed at once. A message whose callback fails is requeued after
   * the `workerDelayer` delay, so it is delivered again. Set to false to poll with `receiveMessage`.
   *
   * @default true
   */
  push?: boolean;

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.push ??= true;
    return this;
  }
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
   * Work the queue, with the messages pushed by the broker when `push` is enabled
   *
   * The callback runs as each message is delivered; the message is acknowledged once it succeeds. When it fails,
   * the message is rejected and requeued after the `workerDelayer` delay. Cancelling stops the delivery, waits
   * for the callbacks in progress and closes the channel: the messages not acknowledged go back to the queue.
   *
   * @override
   * @param callback - the callback function
   * @param eventPrototype - the event prototype
   * @returns the consumer, resolved once cancelled
   */
  consume(callback: (event: T) => Promise<void>, eventPrototype?: { new (): T }): CancelablePromise {
    if (!this.parameters.push) {
      return super.consume(callback, eventPrototype);
    }
    let channel: amqplib.Channel | undefined;
    let consumerTag: string | undefined;
    let cancelled = false;
    // Consecutive failed messages, and failed subscriptions
    let failures = 0;
    let failedSubscriptions = 0;
    let finish: () => void;
    const processing = new Set<Promise<void>>();
    const requeues = new Set<NodeJS.Timeout>();
    const process = async (ch: amqplib.Channel, msg: amqplib.ConsumeMessage) => {
      this.metrics.messages_received.inc();
      const end = this.metrics.processing_duration.startTimer();
      try {
        await callback(this.unserialize(msg.content.toString(), eventPrototype));
      } catch (err) {
        this.metrics.errors.inc();
        this.log("ERROR", `Message ${msg.fields.deliveryTag}`, err);
        // Requeue later: an immediate requeue would deliver a failing message again in a tight loop
        const timer = setTimeout(() => {
          requeues.delete(timer);
          try {
            ch.nack(msg, false, true);
          } catch {
            // The channel is closing: the broker requeues the message
          }
        }, this.delayer(++failures));
        requeues.add(timer);
        return;
      } finally {
        end();
      }
      failures = 0;
      try {
        ch.ack(msg);
      } catch (err) {
        // The channel closed meanwhile: the broker requeues the message
        this.log("WARN", `Cannot acknowledge message ${msg.fields.deliveryTag}`, err);
      }
    };
    const subscribe = async () => {
      if (!this.conn) {
        throw new WebdaError.CodeError("AMQP_NOT_CONNECTED", "AMQP service is not connected");
      }
      const ch = await this.conn.createChannel();
      ch.on("error", err => this.log("WARN", `AMQP consumer channel error: ${err.message}`));
      ch.on("close", () => {
        requeues.forEach(timer => clearTimeout(timer));
        requeues.clear();
        // Closed by the broker or an error: subscribe again, unless the service is stopped
        if (cancelled || channel !== ch) return;
        channel = undefined;
        retry();
      });
      await ch.prefetch(this.getMaxConsumers());
      channel = ch;
      failedSubscriptions = 0;
      consumerTag = (
        await ch.consume(this.parameters.queue, msg => {
          if (msg === null) {
            // The broker cancelled the consumer: the queue was deleted
            this.log("WARN", `AMQP consumer of ${this.parameters.queue} cancelled by the broker`);
            ch.close().catch(() => {});
            return;
          }
          const work = process(ch, msg);
          processing.add(work);
          work.finally(() => processing.delete(work));
        })
      ).consumerTag;
    };
    const retry = () => {
      if (!this.conn) {
        // The service was stopped
        finish();
        return;
      }
      setTimeout(() => {
        if (cancelled) return;
        subscribe().catch(err => {
          this.log("ERROR", `Cannot consume ${this.parameters.queue}`, err);
          retry();
        });
      }, this.delayer(++failedSubscriptions));
    };
    return new CancelablePromise<void>(
      (resolve, reject) => {
        finish = resolve;
        subscribe().catch(err => {
          if (!this.conn) {
            reject(err);
            return;
          }
          this.log("ERROR", `Cannot consume ${this.parameters.queue}`, err);
          retry();
        });
      },
      async () => {
        cancelled = true;
        const ch = channel;
        channel = undefined;
        if (ch && consumerTag) {
          await ch.cancel(consumerTag).catch(() => {});
        }
        requeues.forEach(timer => clearTimeout(timer));
        requeues.clear();
        await Promise.all(processing);
        // Messages waiting to be requeued go back to the queue with the channel
        await ch?.close().catch(() => {});
        finish();
      }
    );
  }

  /**
   * Purge the queue, used by tests
   */
  async __clean(): Promise<void> {
    await this.getChannel().purgeQueue(this.parameters.queue);
  }
}

export { AMQPQueue };
