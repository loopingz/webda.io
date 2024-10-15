import { randomUUID } from "crypto";
import { JSONUtils } from "@webda/utils";
import { type MessageReceipt, Queue, QueueParameters } from "./queueservice";
import { ServiceParameters } from "../interfaces";

interface QueueMap {
  [key: string]: any;
}

export class MemoryQueueParameters extends QueueParameters {
  /**
   * Number of seconds before droping message
   *
   * @default 30
   */
  expire?: number;

  constructor(params: any) {
    super(params);
    this.expire = this.expire ?? 30;
    this.expire *= 1000;
  }
}

/**
 * FIFO Queue in Memory
 * @category CoreServices
 * @WebdaModda
 */
export class MemoryQueue<T = any, K extends MemoryQueueParameters = MemoryQueueParameters> extends Queue<T, K> {
  private _queue: QueueMap = {};
  /**
   * Allow to cancel timeout
   */
  private pendingReads: (() => void)[] = [];

  /**
   * Load parameters
   *
   * @param params
   * @ignore
   */
  loadParameters(params: any): ServiceParameters {
    return new MemoryQueueParameters(params);
  }

  /**
   * Return queue size
   */
  async size(): Promise<number> {
    return Object.keys(this._queue).length;
  }

  /**
   * @override
   */
  async sendMessage(params) {
    let uid = randomUUID();
    // Avoid duplication
    while (this._queue[uid]) {
      uid = randomUUID();
    }
    this._queue[uid] = {
      Body: JSONUtils.stringify(params, undefined, 0),
      Claimed: 0,
      ReceiptHandle: uid
    };
    const pendingRead = this.pendingReads.shift();
    if (pendingRead) {
      pendingRead();
    }
  }

  /**
   * @override
   */
  getItem<L>(proto?: { new (): L }): MessageReceipt<L>[] {
    for (const i in this._queue) {
      if (this._queue[i].Claimed < new Date().getTime() - this.parameters.expire) {
        this._queue[i].Claimed = new Date().getTime();
        return [
          {
            ReceiptHandle: this._queue[i].ReceiptHandle,
            Message: this.unserialize(this._queue[i].Body, proto)
          }
        ];
      }
    }
    return [];
  }

  /**
   * @inheritdoc
   */
  async receiveMessage<L>(proto?: { new (): L }): Promise<MessageReceipt<L>[]> {
    const items = this.getItem<L>(proto);
    if (items.length > 0) {
      return items;
    }
    // We wait for 30s before returning an empty array or a message if interrupted
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        this.pendingReads = this.pendingReads.filter(r => r !== resolve);
        resolve();
      }, 30000);
      this.pendingReads.push(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
    return this.getItem();
  }

  /**
   * @inheritdoc
   */
  async deleteMessage(receipt) {
    if (this._queue[receipt]) {
      delete this._queue[receipt];
    }
  }

  /**
   * @inheritdoc
   */
  async __clean() {
    this._queue = {};
  }
}
