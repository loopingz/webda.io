import { ServiceParameters } from "../services/serviceparameters.js";
import { CancelablePromise, WaitDelayer, WaitDelayerDefinition } from "@webda/utils";
import { PubSubService } from "./pubsubservice.js";
/**
 * Raw message from queue
 */
export interface MessageReceipt<T = any> {
    /**
     * Message
     */
    Message: T;
    /**
     * Id of message to acknowledge
     */
    ReceiptHandle: string;
}
/**
 * @inheritdoc
 */
export declare class QueueParameters extends ServiceParameters {
    /**
     * Delayer between two failed attempts to process messages
     */
    workerDelayer?: WaitDelayerDefinition;
    /**
     * Define if worker should process multi message received in //
     * @default true
     */
    workerParallelism: boolean;
    /**
     * Max number of queue consumers
     * Queue will auto increase to this max number if queue is loaded
     * and it will decrease to just one consumer if no messages are available
     *
     * @default 10
     */
    maxConsumers: number;
}
/**
 * AbstractQueue implements the worker system
 *
 * A Consumer allows you to define how to process message from
 * the queue, implementing the retries policy
 *
 * @category CoreServices
 */
declare abstract class Queue<T = any, K extends QueueParameters = QueueParameters> extends PubSubService<T, K> {
    /**
     * Current timeout handler
     */
    protected _timeout: NodeJS.Timeout;
    /**
     * Callback function to call for each message
     */
    private callback;
    /**
     * Current pause instance
     */
    protected failedIterations: number;
    /**
     * Delayer
     */
    protected delayer: WaitDelayer;
    eventPrototype: new () => T;
    /**
     * Receive one or several messages
     */
    abstract receiveMessage<L>(proto?: {
        new (): L;
    }): Promise<MessageReceipt<L>[]>;
    /**
     * Delete one message based on its receipt
     * @param id
     */
    abstract deleteMessage(id: string): Promise<void>;
    /**
     * Create the delayer
     */
    resolve(): this;
    /**
     * Receive and process message from the queue
     *
     * @returns
     */
    protected consumerReceiveMessage(): Promise<{
        speed: number;
        items: number;
    }>;
    /**
     * Return the max consumers for the queue
     *
     * It is overridable so if a queue can retrieve several message at once
     * it can just use the worker // and several messages at once
     *
     * SQS for example will return this.parameters.maxConsumers / 10
     *
     * @returns
     */
    getMaxConsumers(): number;
    /**
     * Work a queue calling the callback with every Event received
     * If the callback is called without exception the `deleteMessage` is called
     * @param callback
     * @param eventPrototype
     */
    consume(callback: (event: T) => Promise<void>, eventPrototype?: {
        new (): T;
    }): CancelablePromise;
}
export { Queue };
//# sourceMappingURL=queueservice.d.ts.map