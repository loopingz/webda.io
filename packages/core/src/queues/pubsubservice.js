import { Counter, Gauge, Histogram } from "../metrics/metrics.js";
import { Service } from "../services/service.js";
export default class PubSubService extends Service {
    /**
     * @override
     */
    initMetrics() {
        super.initMetrics();
        this.metrics.messages_sent = this.getMetric(Counter, { name: "messages_sent", help: "Number of messages sent" });
        this.metrics.messages_received = this.getMetric(Counter, {
            name: "messages_received",
            help: "Number of messages received"
        });
        this.metrics.processing_duration = this.getMetric(Histogram, {
            name: "messages_processing_duration",
            help: "Time to consume an item"
        });
        this.metrics.errors = this.getMetric(Counter, {
            name: "messages_errors",
            help: "Number of item in error"
        });
        this.metrics.messages_pending = this.getMetric(Gauge, {
            name: "messages_pending",
            help: "Number of item in the queue",
            collect: async () => {
                this.metrics.messages_pending.set(await this.size());
            }
        });
    }
    /**
     * Unserialize into class
     * @param data
     * @param proto
     * @returns
     */
    unserialize(data, proto) {
        if (proto) {
            return Object.assign(new proto(), JSON.parse(data));
        }
        return JSON.parse(data);
    }
}
export { PubSubService };
//# sourceMappingURL=pubsubservice.js.map