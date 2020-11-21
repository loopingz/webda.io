"use strict";
import * as uuid from "uuid";
import { ModdaDefinition } from "../core";
import { Service, ServiceParameters } from "../services/service";
import { JSONUtils } from "../utils/json";
import { Queue } from "./queueservice";

interface QueueMap {
  [key: string]: any;
}

export class MemoryQueueParameters extends ServiceParameters {
  expire: number;

  constructor(params: any) {
    super(params);
    this.expire = this.expire ?? 30;
    this.expire *= 1000;
  }
}

/**
 * FIFO Queue in Memory
 * @category CoreServices
 */
class MemoryQueue<T extends MemoryQueueParameters = MemoryQueueParameters> extends Queue<T> {
  private _queue: QueueMap = {};

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

  async sendMessage(params) {
    var uid = uuid.v4();
    if (!this._queue) {
      console.log("weird");
      try {
        throw new Error();
      } catch (err) {
        console.log(err);
      }
    }
    // Avoid duplication
    while (this._queue[uid]) {
      uid = uuid.v4();
    }
    this._queue[uid] = {
      Body: JSONUtils.stringify(params, undefined, 0),
      Claimed: 0,
      ReceiptHandle: uid
    };
  }

  async receiveMessage() {
    for (var i in this._queue) {
      if (this._queue[i].Claimed < new Date().getTime() - this._params.expire) {
        this._queue[i].Claimed = new Date().getTime();
        return [this._queue[i]];
      }
    }
    return [];
  }

  async deleteMessage(receipt) {
    if (this._queue[receipt]) {
      delete this._queue[receipt];
    }
  }

  async __clean() {
    this._queue = {};
  }

  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/MemoryQueue",
      label: "MemoryQueue",
      description: "Implements a simple in memory queue",
      logo: "images/icons/memoryqueue.png",
      configuration: {}
    };
  }
}
export { MemoryQueue };
