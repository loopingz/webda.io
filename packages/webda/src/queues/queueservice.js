"use strict";
const Service = require("../services/service");

class QueueService extends Service {

  sendMessage(params) {
    throw Error("Abstract service");
  }

  receiveMessage() {
    throw Error("Abstract service");
  }

  deleteMessage(id) {
    throw Error("Abstract service");
  }

  size() {
    throw Error("Abstract service");
  }

  async _workerResume() {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
    this._timeout = setTimeout(this._workerReceiveMessage.bind(this), 1000);
  }

  async _workerReceiveMessage() {
    if (this._interrupt) {
      return;
    }
    try {
      let items = await this.receiveMessage();
      try {
        if (items.length === 0) {
          return this._workerResume();
        }
        for (var i = 0; i < items.length; i++) {
          let msg = items[i];
          let event = JSON.parse(msg.Body);
          await this.callback(event);
          await this.deleteMessage(msg.ReceiptHandle);
        }
        return this._workerResume();
      } catch (err) {
        this._webda.log('ERROR', 'Notification', err);
        return this._workerResume();
      }
    } catch (err) {
      this.pause *= 2;
      this._webda.log('ERROR', err);
      setTimeout(this._workerReceiveMessage.bind(this), this.pause * 1000);
    }
  }

  async worker(callback) {
    this.pause = 1;
    this.callback = callback;
    this._workerReceiveMessage();
  }

  stop() {
    this._interrupt = true;
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
  }

  __clean() {

  }
}

module.exports = QueueService;
