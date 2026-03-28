import { ServiceParameters } from "../services/serviceparameters.js";
import { CancelableLoopPromise, WaitDelayerFactories } from "@webda/utils";
import { PubSubService } from "./pubsubservice.js";
/**
 * @inheritdoc
 */
export class QueueParameters extends ServiceParameters {
    constructor() {
        super(...arguments);
        /**
         * Define if worker should process multi message received in //
         * @default true
         */
        this.workerParallelism = true;
        /**
         * Max number of queue consumers
         * Queue will auto increase to this max number if queue is loaded
         * and it will decrease to just one consumer if no messages are available
         *
         * @default 10
         */
        this.maxConsumers = 10;
    }
}
/**
 * AbstractQueue implements the worker system
 *
 * A Consumer allows you to define how to process message from
 * the queue, implementing the retries policy
 *
 * @category CoreServices
 */
class Queue extends PubSubService {
    /**
     * Create the delayer
     */
    resolve() {
        super.resolve();
        this.delayer = WaitDelayerFactories.get(this.parameters.workerDelayer);
        return this;
    }
    /**
     * Receive and process message from the queue
     *
     * @returns
     */
    async consumerReceiveMessage() {
        try {
            let speed = Date.now();
            const items = await this.receiveMessage(this.eventPrototype);
            this.metrics.messages_received.inc(items.length);
            speed = Date.now() - speed;
            this.failedIterations = 0;
            if (items.length === 0) {
                return { speed, items: items.length };
            }
            const msgWorker = async (msg) => {
                const end = this.metrics.processing_duration.startTimer();
                try {
                    await this.callback(msg.Message);
                    await this.deleteMessage(msg.ReceiptHandle);
                }
                catch (err) {
                    this.metrics.errors.inc();
                    this.log("ERROR", `Message ${msg.ReceiptHandle}`, err);
                }
                finally {
                    end();
                }
            };
            if (this.parameters.workerParallelism) {
                // Parallelized processing
                await Promise.all(items.map(msgWorker));
            }
            else {
                // Serialized processing
                for (const item of items) {
                    await msgWorker(item);
                }
            }
            return { speed, items: items.length };
        }
        catch (err) {
            this.failedIterations += 1;
            this.log("ERROR", err);
            await new Promise(resolve => setTimeout(resolve, this.delayer(this.failedIterations)));
            return { speed: 0, items: -1 };
        }
    }
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
    getMaxConsumers() {
        return this.parameters.maxConsumers;
    }
    /**
     * Work a queue calling the callback with every Event received
     * If the callback is called without exception the `deleteMessage` is called
     * @param callback
     * @param eventPrototype
     */
    consume(callback, eventPrototype) {
        this.failedIterations = 0;
        this.callback = callback;
        this.eventPrototype = eventPrototype;
        const consumers = new Set();
        const childQueueCallback = async (canceller) => {
            const res = await this.consumerReceiveMessage();
            // If an error occured or no results found, stop the child
            if (res.items <= 0) {
                await canceller();
            }
        };
        const parentQueueCallback = async (_canceller) => {
            const res = await this.consumerReceiveMessage();
            if (res.items > 0 && res.speed < 3000 && consumers.size < this.getMaxConsumers() - 1) {
                this.log("TRACE", `Launching a new queue consumer for ${this.getName()}`);
                const consumer = new CancelableLoopPromise(childQueueCallback);
                // Add consumer to our list
                consumers.add(consumer);
                // Remove consumer once finished
                consumer.finally(() => {
                    consumers.delete(consumer);
                });
            }
        };
        return new CancelableLoopPromise(parentQueueCallback, async () => {
            await Promise.all(Array.from(consumers).map(c => c.cancel()));
        });
    }
}
export { Queue };
//# sourceMappingURL=queueservice.js.map