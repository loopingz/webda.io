import { Counter, Gauge, Histogram } from "../metrics/metrics.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { Service } from "../services/service.js";
import { CancelablePromise } from "@webda/utils";
export default abstract class PubSubService<T = any, K extends ServiceParameters = ServiceParameters> extends Service<K> {
    /**
     * @override
     */
    protected metrics: {
        errors: Counter;
        processing_duration: Histogram;
        messages_sent: Counter;
        messages_received: Counter;
        messages_pending: Gauge;
    };
    /**
     * @override
     */
    initMetrics(): void;
    /**
     * Send an event to the queue
     * @param event
     */
    abstract sendMessage(event: T): Promise<void>;
    /**
     * Unserialize into class
     * @param data
     * @param proto
     * @returns
     */
    unserialize<L>(data: string, proto?: {
        new (): L;
    }): L;
    /**
     * Size of the consumer if any
     * @returns
     */
    abstract size(): Promise<number>;
    /**
     * Subscribe to a channel calling the callback with every Event received
     * @param callback
     * @param eventPrototype
     */
    abstract consume(callback: (event: T) => Promise<void>, eventPrototype?: {
        new (): T;
    }, onBind?: () => void): CancelablePromise;
}
export { PubSubService };
//# sourceMappingURL=pubsubservice.d.ts.map