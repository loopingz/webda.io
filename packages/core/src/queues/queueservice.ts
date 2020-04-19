import { Service } from "../services/service";

/**
 * @category CoreServices
 */
abstract class Queue extends Service {
  _timeout: any;
  _interrupt: boolean;
  callback: Function;
  pause: number;

  abstract async sendMessage(params: any);

  abstract async receiveMessage(): Promise<any>;

  abstract async deleteMessage(id: string);

  abstract async size(): Promise<number>;

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
      if (items.length === 0) {
        return this._workerResume();
      }
      for (var i = 0; i < items.length; i++) {
        let msg = items[i];
        let event = JSON.parse(msg.Body);
        try {
          await this.callback(event);
          await this.deleteMessage(msg.ReceiptHandle);
        } catch (err) {
          this._webda.log("ERROR", "Notification", err);
        }
      }
      return this._workerResume();
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
