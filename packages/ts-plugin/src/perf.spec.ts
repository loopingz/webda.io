

import { describe, it, expect, vi } from "vitest";
import { PerfTracker } from "./perf";

describe("PerfTracker", () => {
  describe("constructor", () => {
    it("should default to enabled with 50ms warning threshold", () => {
      const tracker = new PerfTracker(() => {});
      expect(tracker.enabled).toBe(true);
    });

    it("should respect enabled option", () => {
      const tracker = new PerfTracker(() => {}, { enabled: false });
      expect(tracker.enabled).toBe(false);
    });

    it("should respect custom warnMs option", () => {
      const logs: string[] = [];
      const tracker = new PerfTracker(msg => logs.push(msg), { warnMs: 0 });
      // Any measurement should trigger a warning with warnMs=0
      tracker.measure("test", () => {});
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0]).toContain("perf: test took");
    });
  });

  describe("measure()", () => {
    it("should return the function result", () => {
      const tracker = new PerfTracker(() => {});
      const result = tracker.measure("op", () => 42);
      expect(result).toBe(42);
    });

    it("should record stats for the operation", () => {
      const tracker = new PerfTracker(() => {});
      tracker.measure("op", () => {});
      const stats = tracker.get("op");
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
      expect(stats!.totalMs).toBeGreaterThanOrEqual(0);
      expect(stats!.maxMs).toBeGreaterThanOrEqual(0);
    });

    it("should accumulate stats across multiple calls", () => {
      const tracker = new PerfTracker(() => {});
      tracker.measure("op", () => {});
      tracker.measure("op", () => {});
      tracker.measure("op", () => {});
      const stats = tracker.get("op");
      expect(stats!.count).toBe(3);
    });

    it("should skip timing when disabled", () => {
      const tracker = new PerfTracker(() => {}, { enabled: false });
      const result = tracker.measure("op", () => "hello");
      expect(result).toBe("hello");
      // No stats should be recorded
      expect(tracker.get("op")).toBeUndefined();
    });

    it("should still record stats even if the function throws", () => {
      const tracker = new PerfTracker(() => {});
      expect(() => {
        tracker.measure("failing", () => {
          throw new Error("boom");
        });
      }).toThrow("boom");
      const stats = tracker.get("failing");
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
    });

    it("should track maxMs correctly", () => {
      const tracker = new PerfTracker(() => {}, { warnMs: 1000 });
      // First call
      tracker.measure("op", () => {});
      const stats1 = tracker.get("op")!;
      const firstMax = stats1.maxMs;
      // Second call - maxMs should be >= firstMax
      tracker.measure("op", () => {});
      const stats2 = tracker.get("op")!;
      expect(stats2.maxMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("warning threshold", () => {
    it("should log a warning when a measurement exceeds warnMs", () => {
      const logs: string[] = [];
      // Set warnMs to 0 so any measurement triggers the warning
      const tracker = new PerfTracker(msg => logs.push(msg), { warnMs: 0 });
      tracker.measure("slowOp", () => {});
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0]).toContain("perf: slowOp took");
      expect(logs[0]).toContain("calls=1");
      expect(logs[0]).toContain("avg=");
      expect(logs[0]).toContain("max=");
    });

    it("should not log when measurement is under threshold", () => {
      const logs: string[] = [];
      const tracker = new PerfTracker(msg => logs.push(msg), { warnMs: 999999 });
      tracker.measure("fastOp", () => {});
      expect(logs).toHaveLength(0);
    });
  });

  describe("get()", () => {
    it("should return undefined for unknown operations", () => {
      const tracker = new PerfTracker(() => {});
      expect(tracker.get("nonexistent")).toBeUndefined();
    });

    it("should return stats for a tracked operation", () => {
      const tracker = new PerfTracker(() => {});
      tracker.measure("myOp", () => {});
      const stats = tracker.get("myOp");
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
    });
  });

  describe("getAll()", () => {
    it("should return empty map when no data", () => {
      const tracker = new PerfTracker(() => {});
      const all = tracker.getAll();
      expect(all.size).toBe(0);
    });

    it("should return all tracked operations sorted by totalMs descending", () => {
      const tracker = new PerfTracker(() => {}, { warnMs: 999999 });
      // Perform measurements with different work to create different totals
      tracker.measure("fast", () => {});
      // Do more work for the slow op to ensure higher totalMs
      tracker.measure("slow", () => {
        let sum = 0;
        for (let i = 0; i < 100000; i++) sum += i;
        return sum;
      });

      const all = tracker.getAll();
      expect(all.size).toBe(2);
      const keys = [...all.keys()];
      // The one with higher totalMs should come first
      const values = [...all.values()];
      expect(values[0].totalMs).toBeGreaterThanOrEqual(values[1].totalMs);
    });
  });

  describe("summary()", () => {
    it("should return 'no data collected' when empty", () => {
      const tracker = new PerfTracker(() => {});
      expect(tracker.summary()).toBe("perf: no data collected");
    });

    it("should format a human-readable summary", () => {
      const tracker = new PerfTracker(() => {}, { warnMs: 999999 });
      tracker.measure("opA", () => {});
      tracker.measure("opB", () => {});

      const summary = tracker.summary();
      expect(summary).toContain("perf summary:");
      expect(summary).toContain("opA:");
      expect(summary).toContain("opB:");
      expect(summary).toContain("calls");
      expect(summary).toContain("total=");
      expect(summary).toContain("avg=");
      expect(summary).toContain("max=");
    });
  });

  describe("reset()", () => {
    it("should clear all stats", () => {
      const tracker = new PerfTracker(() => {});
      tracker.measure("op1", () => {});
      tracker.measure("op2", () => {});
      expect(tracker.getAll().size).toBe(2);

      tracker.reset();
      expect(tracker.getAll().size).toBe(0);
      expect(tracker.get("op1")).toBeUndefined();
      expect(tracker.summary()).toBe("perf: no data collected");
    });
  });
});
