import { Constructor } from "@webda/tsc-esm";
import {
  Counter,
  CounterConfiguration,
  Gauge,
  GaugeConfiguration,
  Histogram,
  HistogramConfiguration,
  register
} from "prom-client";
import { useParameters } from "../core/instancestorage";

/**
 * Generic type for metric
 */
export type MetricConfiguration<T = Counter | Gauge | Histogram, K extends string = string> = T extends Counter
  ? CounterConfiguration<K>
  : T extends Gauge
    ? GaugeConfiguration<K>
    : HistogramConfiguration<K>;

/**
 * Export a Registry type alias
 */
//export type Registry = Store;

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
export function useMetric<T = Gauge | Counter | Histogram>(
  type: Constructor<T, [MetricConfiguration<T>]>,
  configuration: MetricConfiguration<T>
): T {
  const metrics = useParameters().metrics;
  if (metrics === false) {
    // Return a mock
    return <T>{
      inc: () => {},
      reset: () => {},
      labels: () => undefined,
      remove: () => {},
      observe: () => {},
      startTimer: () => {
        return () => 0;
      },
      zero: () => {},
      dec: () => {},
      setToCurrentTime: () => {},
      set: () => {}
    };
  }
  const name = `${metrics.prefix}webda_${configuration.name}`;
  const labelNames = [...(configuration.labelNames || []), ...Object.keys(metrics.labels)];
  // Will probably need to override with a staticLabels property
  return (
    <T>register.getSingleMetric(name) ||
    new type({
      ...configuration,
      ...metrics.config[configuration.name],
      name,
      labelNames
    })
  );
}

export { Counter, Gauge, Histogram };
