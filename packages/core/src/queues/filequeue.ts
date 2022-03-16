import * as uuid from "uuid";
import { ServiceParameters } from "../services/service";
import { JSONUtils } from "../utils/serializers";
import { MessageReceipt, Queue, QueueParameters } from "./queueservice";
import * as fs from "fs";
import { join } from "path";

export class FileQueueParameters extends QueueParameters {
  /**
   * Number of seconds before droping message
   *
   * @default 30
   */
  expire?: number;
  /**
   * Where to store the queue
   */
  folder: string;

  constructor(params: any) {
    super(params);
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
   * @inheritdoc
   */
  loadParameters(params: any): ServiceParameters {
    return new FileQueueParameters(params);
  }

  /**
   * Create the storage folder if does not exist
   */
  computeParameters() {
    super.computeParameters();
    if (!fs.existsSync(this.parameters.folder)) {
      fs.mkdirSync(this.parameters.folder);
    }
  }

  /**
   * @inheritdoc
   */
  async size(): Promise<number> {
    return fs.readdirSync(this.parameters.folder).filter(f => f.endsWith(".json")).length;
  }

  /**
   * Return file
   * @param uid
   * @returns
   */
  getFile(uid: string): string {
    return join(this.parameters.folder, `${uid}.json`);
  }

  /**
   * @inheritdoc
   */
  async sendMessage(params) {
    var uid = uuid.v4();
    let file = this.getFile(uid);
    // Avoid duplication
    while (fs.existsSync(file)) {
      uid = uuid.v4();
      file = this.getFile(uid);
    }
    JSONUtils.saveFile(params, file);
  }

  /**
   * @inheritdoc
   */
  async receiveMessage<L>(proto?: { new (): L }): Promise<MessageReceipt<L>[]> {
    const files = fs
      .readdirSync(this.parameters.folder)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        const lockFile = join(this.parameters.folder, f + ".lock");
        let res = {
          ...fs.lstatSync(join(this.parameters.folder, f)),
          path: join(this.parameters.folder, f),
          hasLock: fs.existsSync(lockFile),
          uid: f.substr(0, f.length - 5)
        };
        if (res.hasLock) {
          const lock = fs.lstatSync(lockFile);
          if (lock.ctimeMs < Date.now() - this.parameters.expire) {
            res.hasLock = false;
            fs.unlinkSync(lockFile);
          }
        }
        return res;
      })
      .filter(f => !f.hasLock)
      .sort((a, b) => {
        // It is not relevant as it is fs based
        /* istanbul ignore if  */
        if (a.ctime > b.ctime) {
          return 1;
        }
        /* istanbul ignore next  */
        return -1;
      });
    if (files.length) {
      let el = files.shift();
      // Create the lock
      fs.writeFileSync(el.path + ".lock", "");
      return [
        {
          ReceiptHandle: el.uid,
          Message: this.unserialize(fs.readFileSync(el.path).toString(), proto)
        }
      ];
    } else {
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    return [];
  }

  /**
   * @inheritdoc
   */
  async deleteMessage(receipt) {
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
    // Use require on purpose to avoid adding fs-extra as runtime dep
    // The __clean method is only used by unit test
    require("fs-extra").emptyDirSync(this.parameters.folder);
  }
}
