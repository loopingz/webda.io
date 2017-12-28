"use strict";
const QueueService = require("./queueservice");
const uuid = require('uuid');

class MemoryQueueService extends QueueService {

  init(config) {
    super.init(config);
    this._queue = {};
    if (!this._params.expire) {
      this._params.expire = 30;
    }
    this._params.expire *= 1000;
  }

  size() {
    return Promise.resolve(Object.keys(this._queue).length);
  }

  sendMessage(params) {
    var uid = uuid.v4();
    this._queue[uid] = {Body: params, Claimed: 0, ReceiptHandle: uid};
    return Promise.resolve();
  }

  receiveMessage() {
    for (var i in this._queue) {
      if (this._queue[i].Claimed < new Date().getTime() - this._params.expire) {
        this._queue[i].Claimed = new Date().getTime();
        return [this._queue[i]];
      }
    }
    return [];
  }

  deleteMessage(receipt) {
    if (this._queue[receipt]) {
      delete this._queue[receipt];
    }
  }

  __clean() {
    this._queue = {};
  }

  static getModda() {
    return {
      "uuid": "Webda/MemoryQueue",
      "label": "MemoryQueue",
      "description": "Implements a simple in memory queue",
      "webcomponents": [],
      "documentation": "",
      "logo": "images/placeholders/memoryqueue.png",
      "configuration": {
        "default": {
        }
      }
    }
  }
}

module.exports = MemoryQueueService