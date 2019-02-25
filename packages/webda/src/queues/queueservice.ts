import { Service } from "../index";

class Queue extends Service {
  _timeout: any;
  _interrupt: boolean;
  callback: Function;
  pause: number;

  async sendMessage(params: any) {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  async receiveMessage(): Promise<any> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  async deleteMessage(id: string) {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  async size(): Promise<number> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
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
        this._webda.log("ERROR", "Notification", err);
        return this._workerResume();
      }
    } catch (err) {
      this.pause *= 2;
      this._webda.log("ERROR", err);
      setTimeout(this._workerReceiveMessage.bind(this), this.pause * 1000);
    }
  }

  async worker(callback) {
    this.pause = 1;
    this.callback = callback;
    while (!this._interrupt) {
      await this._workerReceiveMessage();
    }
  }

  stop() {
    this._interrupt = true;
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
  }
}

export { Queue };
