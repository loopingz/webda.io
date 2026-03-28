import { randomUUID } from "crypto";
import { JSONUtils } from "@webda/utils";
import { Queue, QueueParameters } from "./queueservice.js";
export class MemoryQueueParameters extends QueueParameters {
    load(params = {}) {
        super.load(params);
        this.expire ?? (this.expire = 30);
        return this;
    }
    get expireMs() {
        return (this.expire || 30) * 1000;
    }
    get timeoutMs() {
        return (this.timeout || 0) * 1000;
    }
}
/**
 * FIFO Queue in Memory
 * @category CoreServices
 * @WebdaModda
 */
export class MemoryQueue extends Queue {
    constructor() {
        super(...arguments);
        this._queue = {};
        /**
         * Allow to cancel timeout
         */
        this.pendingReads = [];
    }
    /**
     * Return queue size
     */
    async size() {
        return Object.keys(this._queue).length;
    }
    /**
     * @override
     */
    async sendMessage(params) {
        let uid = randomUUID();
        // Avoid duplication
        while (this._queue[uid]) {
            uid = randomUUID();
        }
        this._queue[uid] = {
            Body: JSONUtils.stringify(params, undefined, 0),
            Claimed: 0,
            ReceiptHandle: uid
        };
        const pendingRead = this.pendingReads.shift();
        if (pendingRead) {
            pendingRead();
        }
    }
    /**
     * @override
     */
    getItem(proto) {
        const time = Date.now();
        for (const i in this._queue) {
            if (this._queue[i].Claimed < time - this.parameters.expireMs) {
                this._queue[i].Claimed = time;
                return [
                    {
                        ReceiptHandle: this._queue[i].ReceiptHandle,
                        Message: this.unserialize(this._queue[i].Body, proto)
                    }
                ];
            }
        }
        return [];
    }
    /**
     * @inheritdoc
     */
    async receiveMessage(proto) {
        const items = this.getItem(proto);
        if (items.length > 0) {
            return items;
        }
        // We wait before returning an empty array or a message if interrupted
        await new Promise(resolve => {
            const timeout = this.parameters.timeoutMs
                ? setTimeout(() => {
                    this.pendingReads = this.pendingReads.filter(r => r !== resolve);
                    resolve();
                }, this.parameters.timeoutMs)
                : undefined;
            this.pendingReads.push(() => {
                if (timeout) {
                    clearTimeout(timeout);
                }
                resolve();
            });
        });
        return this.getItem();
    }
    /**
     * @inheritdoc
     */
    async deleteMessage(receipt) {
        if (this._queue[receipt]) {
            delete this._queue[receipt];
        }
    }
    /**
     * @inheritdoc
     */
    async __clean() {
        this._queue = {};
    }
}
//# sourceMappingURL=memoryqueue.js.map