

/**
 * Lightweight performance tracker for ts-plugin operations.
 *
 * Tracks per-operation call count, total time, and max time.
 * Logs a warning (with running stats) whenever a single call exceeds `warnMs`.
 *
 * When disabled (`enabled: false`), `measure()` calls the function directly
 * with zero overhead — no timing, no map lookups.
 */
export interface PerfStats {
  /** Number of completed calls */
  count: number;
  /** Cumulative wall-clock time (ms) */
  totalMs: number;
  /** Slowest single call (ms) */
  maxMs: number;
}

export class PerfTracker {
  private stats = new Map<string, PerfStats>();
  readonly enabled: boolean;
  private warnMs: number;
  private logger: (msg: string) => void;

  constructor(logger: (msg: string) => void, options?: { enabled?: boolean; warnMs?: number }) {
    this.logger = logger;
    this.enabled = options?.enabled ?? true;
    this.warnMs = options?.warnMs ?? 50;
  }

  /**
   * Measure a synchronous operation.
   *
   * When the tracker is disabled the function is called directly — no
   * `performance.now()` calls, no map lookups.
   */
  measure<T>(name: string, fn: () => T): T {
    if (!this.enabled) return fn();
    const start = performance.now();
    try {
      return fn();
    } finally {
      this.record(name, performance.now() - start);
    }
  }

  private record(name: string, ms: number): void {
    let entry = this.stats.get(name);
    if (!entry) {
      entry = { count: 0, totalMs: 0, maxMs: 0 };
      this.stats.set(name, entry);
    }
    entry.count++;
    entry.totalMs += ms;
    if (ms > entry.maxMs) entry.maxMs = ms;

    if (ms >= this.warnMs) {
      const avg = entry.totalMs / entry.count;
      this.logger(
        `perf: ${name} took ${ms.toFixed(1)}ms ` +
          `(calls=${entry.count}, avg=${avg.toFixed(1)}ms, max=${entry.maxMs.toFixed(1)}ms)`
      );
    }
  }

  /**
   * Get stats for a specific operation, or undefined if never measured.
   */
  get(name: string): Readonly<PerfStats> | undefined {
    return this.stats.get(name);
  }

  /**
   * Get a snapshot of all tracked stats, sorted by total time descending.
   */
  getAll(): Map<string, Readonly<PerfStats>> {
    return new Map([...this.stats.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs));
  }

  /**
   * Format a human-readable summary of all tracked operations.
   */
  summary(): string {
    if (this.stats.size === 0) return "perf: no data collected";
    const lines = ["perf summary:"];
    for (const [name, s] of this.getAll()) {
      const avg = s.count > 0 ? s.totalMs / s.count : 0;
      lines.push(
        `  ${name}: ${s.count} calls, total=${s.totalMs.toFixed(1)}ms, avg=${avg.toFixed(1)}ms, max=${s.maxMs.toFixed(1)}ms`
      );
    }
    return lines.join("\n");
  }

  /**
   * Reset all collected stats.
   */
  reset(): void {
    this.stats.clear();
  }
}
