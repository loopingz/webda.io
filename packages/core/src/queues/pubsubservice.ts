import { Counter, Gauge, Histogram } from "../metrics/metrics";
import { ServiceParameters } from "../services/serviceparameters";
import { Service } from "../services/service";
import { CancelablePromise } from "@webda/utils";

export default abstract class PubSubService<
  T = any,
  K extends ServiceParameters = ServiceParameters
> extends Service<K> {
  /**
   * @override
   */
  protected declare metrics: {
    errors: Counter;
    processing_duration: Histogram;
    messages_sent: Counter;
    messages_received: Counter;
    messages_pending: Gauge;
  };
  /**
   * @override
   */
  initMetrics(): void {
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
  unserialize<L>(data: string, proto?: { new (): L }): L {
    if (proto) {
      return Object.assign(new proto(), JSON.parse(data));
    }
    return JSON.parse(data);
  }

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
  abstract consume(
    callback: (event: T) => Promise<void>,
    eventPrototype?: { new (): T },
    onBind?: () => void
  ): CancelablePromise;
}

export { PubSubService };
