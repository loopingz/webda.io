import { Counter, Gauge, Histogram, register } from "prom-client";
import { useParameters } from "../core/instancestorage.js";
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
export function useMetric(type, configuration) {
    const metrics = useParameters().metrics;
    if (metrics === false) {
        // Return a mock
        return {
            inc: () => { },
            reset: () => { },
            labels: () => undefined,
            remove: () => { },
            observe: () => { },
            startTimer: () => {
                return () => 0;
            },
            zero: () => { },
            dec: () => { },
            setToCurrentTime: () => { },
            set: () => { }
        };
    }
    const name = `${metrics.prefix}webda_${configuration.name}`;
    const labelNames = [...(configuration.labelNames || []), ...Object.keys(metrics.labels)];
    // Will probably need to override with a staticLabels property
    return (register.getSingleMetric(name) ||
        new type({
            ...configuration,
            ...metrics.config[configuration.name],
            name,
            labelNames
        }));
}
export { Counter, Gauge, Histogram };
//# sourceMappingURL=metrics.js.map