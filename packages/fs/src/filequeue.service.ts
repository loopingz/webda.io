import * as fs from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { Queue, QueueParameters } from "@webda/core";
import { JSONUtils } from "@webda/utils";
import type { MessageReceipt } from "@webda/core";

/**
 * Name prefix of the message files: fixed-width creation time and sequence, so the name order is the FIFO order
 */
const TIME_PREFIX = /^\d{15}-\d{6}-/;

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
   * Sequence of the messages sent in the same millisecond by this process
   */
  protected static sequence = 0;

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
   * New message identifier: creation time and sequence first so sorting the names sorts the messages by age
   *
   * @returns the identifier
   */
  protected newMessageId(): string {
    FileQueue.sequence = (FileQueue.sequence + 1) % 1000000;
    return `${Date.now().toString().padStart(15, "0")}-${FileQueue.sequence.toString().padStart(6, "0")}-${randomUUID()}`;
  }

  /**
   * @override
   */
  async sendMessage(params: T) {
    let uid = this.newMessageId();
    let file = this.getFile(uid);
    while (fs.existsSync(file)) {
      uid = this.newMessageId();
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
   * One directory listing gives the messages and their locks: only the locked messages are inspected, to release
   * the expired locks. The lock is created exclusively, so two consumers, even in different processes, cannot take
   * the same message.
   *
   * @param proto - class of the message
   * @returns the message, or an empty array when every message is locked
   */
  protected pickMessage<L>(proto?: { new (): L }): MessageReceipt<L>[] {
    const folder = this.parameters.folder;
    const entries = fs.readdirSync(folder);
    const locks = new Set(entries.filter(f => f.endsWith(".json.lock")));
    const messages = entries.filter(f => f.endsWith(".json"));
    for (const file of this.sortMessages(messages)) {
      const path = join(folder, file);
      if (locks.has(`${file}.lock`) && !this.releaseExpiredLock(`${path}.lock`)) {
        continue;
      }
      if (!this.lock(path)) {
        // Locked by another consumer since the listing
        continue;
      }
      let content: string;
      try {
        content = fs.readFileSync(path).toString();
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err;
        }
        // Deleted by another consumer since the listing
        fs.rmSync(`${path}.lock`, { force: true });
        continue;
      }
      return [{ ReceiptHandle: file.substring(0, file.length - 5), Message: this.unserialize(content, proto) }];
    }
    return [];
  }

  /**
   * Sort message files from the oldest to the newest
   *
   * Files written by a previous version are named by a random UUID: they come first, ordered by creation time.
   * The other names start with their creation time and sequence.
   *
   * @param files - message file names
   * @returns the sorted names
   */
  protected sortMessages(files: string[]): string[] {
    const legacy = files
      .filter(f => !TIME_PREFIX.test(f))
      .map(f => {
        try {
          return { file: f, time: fs.lstatSync(join(this.parameters.folder, f)).birthtimeMs };
        } catch {
          // Deleted since the listing
          return undefined;
        }
      })
      .filter(f => f !== undefined)
      .sort((a, b) => a.time - b.time)
      .map(f => f.file);
    return [...legacy, ...files.filter(f => TIME_PREFIX.test(f)).sort()];
  }

  /**
   * Create the lock of a message, failing if it exists
   *
   * @param path - path of the message file
   * @returns true when this consumer owns the lock
   */
  protected lock(path: string): boolean {
    try {
      fs.writeFileSync(`${path}.lock`, "", { flag: "wx" });
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        return false;
      }
      throw err;
    }
  }

  /**
   * Remove a lock older than `expire`
   *
   * @param lockPath - path of the lock file
   * @returns true when the lock is gone: expired and removed, or already released
   */
  protected releaseExpiredLock(lockPath: string): boolean {
    try {
      if (fs.statSync(lockPath).mtimeMs >= Date.now() - this.parameters.expire) {
        return false;
      }
      fs.unlinkSync(lockPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
    return true;
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
