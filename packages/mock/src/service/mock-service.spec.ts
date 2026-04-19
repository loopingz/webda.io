import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { MockService } from "./mock-service.js";

@suite("MockService — unit")
class MockServiceUnitTest {
  @test({ name: "generate() delegates to engine.generate and returns instances" })
  async delegates() {
    class Sample {
      accessor age!: number;
    }
    const svc = new MockService();
    const rows = await svc.generate(Sample, { count: 2, seed: 1, mode: "test" });
    expect(rows.length).toBe(2);
    for (const r of rows) expect(typeof r.age).toBe("number");
  }

  @test({ name: "service-level defaults (mode/seed) apply when options omit them" })
  async serviceDefaults() {
    class Sample {
      accessor age!: number;
    }
    const svc = new MockService(undefined, "mock", { mode: "test", seed: 7 });
    const rows = await svc.generate(Sample, { count: 1 });
    expect(rows.length).toBe(1);
  }
}
