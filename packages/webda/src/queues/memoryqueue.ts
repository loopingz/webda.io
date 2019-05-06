"use strict";
import { Queue } from "../index";
import * as uuid from "uuid";

interface QueueMap {
  [key: string]: any;
}

class MemoryQueue extends Queue {
  private _queue: QueueMap;

  async init(): Promise<void> {
    await super.init();
    this._queue = {};
    if (!this._params.expire) {
      this._params.expire = 30;
    }
    this._params.expire *= 1000;
  }

  async size(): Promise<number> {
    return Object.keys(this._queue).length;
  }

  async sendMessage(params) {
    var uid = uuid.v4();
    // Avoid duplication
    while (this._queue[uid]) {
      uid = uuid.v4();
    }
    this._queue[uid] = {
      Body: params,
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

  static getModda() {
    return {
      uuid: "Webda/MemoryQueue",
      label: "MemoryQueue",
      description: "Implements a simple in memory queue",
      webcomponents: [],
      documentation: "",
      logo: "images/icons/memoryqueue.png",
      configuration: {
        default: {}
      }
    };
  }
}

export { MemoryQueue };
