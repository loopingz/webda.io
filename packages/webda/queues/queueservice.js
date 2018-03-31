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

  _workerResume() {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
    this._timeout = setTimeout(this._workerReceiveMessage.bind(this), 1000);
    return Promise.resolve();
  }

  _workerReceiveMessage() {
    if (this._interrupt) {
      return Promise.resolve();
    }
    try {
      return this.receiveMessage().then((items) => {
        if (items.length === 0) {
          return this._workerResume();
        }
        var promise = Promise.resolve();
        for (var i = 0; i < items.length; i++) {
          ((msg) => {
            let event = JSON.parse(msg.Body);
            promise = promise.then(() => {
              return Promise.resolve(this.callback(event));
            }).then(() => {
              return this.deleteMessage(msg.ReceiptHandle);
            });
          })(items[i]);
        }
        return promise;
      }).then(() => {
        return this._workerResume();
      }).catch((err) => {
        this._webda.log('ERROR', 'Notification', err);
        return this._workerResume();
      });
    } catch (err) {
      this.pause *= 2;
      this._webda.log('ERROR', err);
      setTimeout(this._workerReceiveMessage.bind(this), this.pause * 1000);
    }
  }

  worker(callback) {
    this.pause = 1;
    this.callback = callback;
    this._workerReceiveMessage();
    return new Promise((resolve, reject) => {
      this._stop = resolve;
    });
  }

  stop() {
    if (this._stop) {
      this._stop();
    }
    this._stop = undefined;
    this._interrupt = true;
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
  }

  __clean() {

  }
}

module.exports = QueueService;
