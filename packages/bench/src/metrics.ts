/**
 * Snapshot the counters and histograms of a Webda service
 *
 * Services expose their prom-client metrics in `this.metrics` (see `Service.initMetrics`). Gauges are skipped: their
 * `collect` callback may call the backend (e.g. `PubSubService.size()`), which would disturb the measurement.
 * Histograms are reported as `<name>_count` and `<name>_sum`.
 *
 * @param service - the service, any object with a `metrics` record
 * @returns metric values by name, empty when the service has no readable metric (e.g. metrics disabled)
 */
export async function snapshotServiceMetrics(service: any): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const metrics = service?.metrics;
  if (!metrics || typeof metrics !== "object") {
    return result;
  }
  for (const [name, metric] of Object.entries<any>(metrics)) {
    // Gauges have a set method, counters and histograms do not
    if (!metric || typeof metric.get !== "function" || typeof metric.set === "function") {
      continue;
    }
    try {
      const data = await metric.get();
      if (data.type === "histogram") {
        let count = 0;
        let sum = 0;
        for (const value of data.values) {
          if (value.metricName?.endsWith("_count")) count += value.value;
          else if (value.metricName?.endsWith("_sum")) sum += value.value;
        }
        result[`${name}_count`] = count;
        result[`${name}_sum`] = sum;
      } else {
        result[name] = data.values.reduce((total: number, value: any) => total + (value.value ?? 0), 0);
      }
    } catch {
      // Best effort: a metric that cannot be read is not reported
    }
  }
  return result;
}

/**
 * Difference between two metric snapshots
 *
 * @param before - snapshot taken before the scenario
 * @param after - snapshot taken after the scenario
 * @returns after - before for every metric of after, undefined when there is no metric
 */
export function diffMetrics(
  before: Record<string, number>,
  after: Record<string, number>
): Record<string, number> | undefined {
  const keys = Object.keys(after);
  if (keys.length === 0) {
    return undefined;
  }
  const diff: Record<string, number> = {};
  for (const key of keys) {
    diff[key] = Math.round((after[key] - (before[key] ?? 0)) * 1e6) / 1e6;
  }
  return diff;
}
