import * as fs from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { Queue, QueueParameters } from "@webda/core";
import { JSONUtils } from "@webda/utils";
import type { MessageReceipt } from "@webda/core";

/** Configuration parameters for the filesystem-backed FIFO queue. */
export class FileQueueParameters extends QueueParameters {
  /**
   * Number of seconds before dropping message
   *
   * @default 30
   */
  expire: number;
  /**
   * Where to store the queue
   */
  folder: string;
  /**
   * Number of seconds to wait for a message when the queue is empty, before returning no message
   *
   * A message sent by this service ends the wait immediately; messages written by other processes are picked up
   * within `pollInterval`.
   *
   * @default 10
   */
  timeout?: number;
  /**
   * Interval between two checks of the folder while waiting for a message, in milliseconds
   *
   * @default 100
   */
  pollInterval?: number;

  /**
   * Load parameters with expiration in seconds.
   * @param params - raw parameters
   * @returns this instance
   */
  load(params: any = {}): this {
    super.load(params);
    this.expire ??= 30;
    this.timeout ??= 10;
    this.pollInterval ??= 100;
    return this;
  }

  /** Set default expiration to 30 seconds and convert to milliseconds. */
  default() {
    this.expire = this.expire ?? 30;
    this.expire *= 1000;
  }
}

/**
 * FIFO Queue on filesystem
 * @category CoreServices
 * @WebdaModda
 */
export class FileQueue<T = any, K extends FileQueueParameters = FileQueueParameters> extends Queue<T, K> {
  /**
   * Receivers waiting for a message, woken up by {@link sendMessage}
   */
  protected waiters = new Set<() => void>();

  /**
   * @override
   */
  loadParameters(params: any): K {
    return <K>new FileQueueParameters().load(params);
  }

  /**
   * Create the storage folder if does not exist
   */
  computeParameters() {
    super.computeParameters();
    this.parameters.default?.();
    if (!fs.existsSync(this.parameters.folder)) {
      fs.mkdirSync(this.parameters.folder);
    }
  }

  /**
   * @override
   */
  async size(): Promise<number> {
    return fs.readdirSync(this.parameters.folder).filter(f => f.endsWith(".json")).length;
  }

  /**
   * Return file
   *
   * @param uid - the message unique identifier
   * @returns the file path
   */
  getFile(uid: string): string {
    return join(this.parameters.folder, `${uid}.json`);
  }

  /**
   * @override
   */
  async sendMessage(params: T) {
    let uid = randomUUID();
    let file = this.getFile(uid);
    while (fs.existsSync(file)) {
      uid = randomUUID();
      file = this.getFile(uid);
    }
    JSONUtils.saveFile(params, file);
    // Wake up the receivers waiting for a message
    [...this.waiters].forEach(wake => wake());
  }

  /**
   * Receive the oldest message not locked, waiting up to `timeout` seconds when the queue is empty
   *
   * @param proto - class of the message
   * @returns the message, or an empty array when none arrived in time
   */
  async receiveMessage<L>(proto?: { new (): L }): Promise<MessageReceipt<L>[]> {
    const deadline = Date.now() + (this.parameters.timeout ?? 10) * 1000;
    let messages = this.pickMessage(proto);
    while (messages.length === 0 && Date.now() < deadline) {
      await this.waitForMessage(Math.min(this.parameters.pollInterval ?? 100, deadline - Date.now()));
      messages = this.pickMessage(proto);
    }
    return messages;
  }

  /**
   * Wait until a message is sent by this service or the delay elapsed
   *
   * @param ms - maximum wait in milliseconds
   * @returns a promise resolved when woken up or after the delay
   */
  protected waitForMessage(ms: number): Promise<void> {
    return new Promise(resolve => {
      const wake = () => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      this.waiters.add(wake);
    });
  }

  /**
   * Lock and read the oldest message not locked
   *
   * @param proto - class of the message
   * @returns the message, or an empty array when every message is locked
   */
  protected pickMessage<L>(proto?: { new (): L }): MessageReceipt<L>[] {
    const files = fs
      .readdirSync(this.parameters.folder)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        const lockFile = join(this.parameters.folder, f + ".lock");
        const res = {
          ...fs.lstatSync(join(this.parameters.folder, f)),
          path: join(this.parameters.folder, f),
          hasLock: fs.existsSync(lockFile),
          uid: f.substring(0, f.length - 5)
        };
        if (res.hasLock) {
          const lock = fs.lstatSync(lockFile);
          if (lock.birthtimeMs < Date.now() - this.parameters.expire) {
            res.hasLock = false;
            fs.unlinkSync(lockFile);
          }
        }
        return res;
      })
      .filter(f => !f.hasLock)
      .sort((a, b) => {
        if (a.birthtimeMs > b.birthtimeMs) {
          return 1;
        }
        return -1;
      });
    const el = files.shift();
    if (el) {
      fs.writeFileSync(el.path + ".lock", "");
      return [
        {
          ReceiptHandle: el.uid,
          Message: this.unserialize(fs.readFileSync(el.path).toString(), proto)
        }
      ];
    }
    return [];
  }

  /**
   * @override
   */
  async deleteMessage(receipt: string) {
    const file = this.getFile(receipt);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      if (fs.existsSync(file + ".lock")) {
        fs.unlinkSync(file + ".lock");
      }
    }
  }

  /**
   * @inheritdoc
   */
  async __clean() {
    fs.mkdirSync(this.parameters.folder, { recursive: true });
    for (const entry of fs.readdirSync(this.parameters.folder)) {
      fs.rmSync(`${this.parameters.folder}/${entry}`, { recursive: true, force: true });
    }
  }
}
