import { type MessageReceipt, Queue, QueueParameters } from "./queueservice.js";
export declare class MemoryQueueParameters extends QueueParameters {
    /**
     * Number of seconds before droping message
     *
     * @default 30
     */
    expire?: number;
    /**
     * Number of seconds to wait for receiving new message
     */
    timeout?: number;
    load(params?: any): this;
    get expireMs(): number;
    get timeoutMs(): number;
}
/**
 * FIFO Queue in Memory
 * @category CoreServices
 * @WebdaModda
 */
export declare class MemoryQueue<T = any, K extends MemoryQueueParameters = MemoryQueueParameters> extends Queue<T, K> {
    private _queue;
    /**
     * Allow to cancel timeout
     */
    private pendingReads;
    /**
     * Return queue size
     */
    size(): Promise<number>;
    /**
     * @override
     */
    sendMessage(params: any): Promise<void>;
    /**
     * @override
     */
    getItem<L>(proto?: {
        new (): L;
    }): MessageReceipt<L>[];
    /**
     * @inheritdoc
     */
    receiveMessage<L>(proto?: {
        new (): L;
    }): Promise<MessageReceipt<L>[]>;
    /**
     * @inheritdoc
     */
    deleteMessage(receipt: any): Promise<void>;
    /**
     * @inheritdoc
     */
    __clean(): Promise<void>;
}
//# sourceMappingURL=memoryqueue.d.ts.map