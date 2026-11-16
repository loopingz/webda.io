import { expect, vi } from "vitest";
import { suite, test } from "@webda/test";
import { Mock } from "@webda/models";
import { generateGraph } from "./graph.js";

class User {
  @Mock.email accessor email!: string;
}
class Order {
  @Mock.integer({ min: 1, max: 100 }) accessor total!: number;
}

@suite("generateGraph")
class GraphTest {
  @test({ name: "generates the requested counts per model" })
  async counts() {
    const r = await generateGraph(
      { User: 3, Order: 5 },
      {
        models: [User, Order],
        seed: 1,
        mode: "test"
      }
    );
    expect(r.User.length).toBe(3);
    expect(r.Order.length).toBe(5);
  }

  @test({ name: "returns empty arrays for unreferenced models" })
  async unreferenced() {
    const r = await generateGraph(
      { User: 2 },
      {
        models: [User, Order],
        seed: 1,
        mode: "test"
      }
    );
    expect(r.User.length).toBe(2);
    expect(r.Order).toEqual([]);
  }

  @test({ name: "mode and seed default from the environment" })
  async defaults() {
    // Under vitest: test mode with seed 0, so two runs match
    const a = await generateGraph({ User: 2 }, { models: [User] });
    const b = await generateGraph({ User: 2 }, { models: [User] });
    expect((a.User as User[]).map(u => u.email)).toEqual((b.User as User[]).map(u => u.email));
    // No models registered: nothing is generated
    expect(await generateGraph({ User: 2 })).toEqual({});

    vi.stubEnv("VITEST", "");
    try {
      // Outside vitest: dev mode, seeded from the clock unless a seed is given
      const dev = await generateGraph({ User: 1 }, { models: [User] });
      expect(dev.User).toHaveLength(1);
      const seeded = await generateGraph({ User: 1 }, { models: [User], seed: 0 });
      expect((seeded.User as User[])[0].email).toBe((a.User as User[])[0].email);
    } finally {
      vi.unstubAllEnvs();
    }
  }
}
