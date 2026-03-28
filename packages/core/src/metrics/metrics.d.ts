import { CustomConstructor } from "@webda/tsc-esm";
import { Counter, CounterConfiguration, Gauge, GaugeConfiguration, Histogram, HistogramConfiguration } from "prom-client";
/**
 * Generic type for metric
 */
export type MetricConfiguration<T = Counter | Gauge | Histogram, K extends string = string> = T extends Counter ? CounterConfiguration<K> : T extends Gauge ? GaugeConfiguration<K> : HistogramConfiguration<K>;
/**
 * Export a Registry type alias
 */
/**
 * Get a metric object
 *
 * Use the Service.getMetric method if possible
 *
 * This is map from prometheus 3 types of metrics
 * Our hope is that we can adapt them to export to other
 * metrics system if needed
 *
 * @param type
 * @param configuration
 * @returns
 */
export declare function useMetric<T = Gauge | Counter | Histogram>(type: CustomConstructor<T, [MetricConfiguration<T>]>, configuration: MetricConfiguration<T>): T;
export { Counter, Gauge, Histogram };
//# sourceMappingURL=metrics.d.ts.map