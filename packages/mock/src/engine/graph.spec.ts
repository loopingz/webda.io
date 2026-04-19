import { expect } from "vitest";
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
    const r = await generateGraph({ User: 3, Order: 5 }, {
      models: [User, Order],
      seed: 1,
      mode: "test"
    });
    expect(r.User.length).toBe(3);
    expect(r.Order.length).toBe(5);
  }

  @test({ name: "returns empty arrays for unreferenced models" })
  async unreferenced() {
    const r = await generateGraph({ User: 2 }, {
      models: [User, Order],
      seed: 1,
      mode: "test"
    });
    expect(r.User.length).toBe(2);
    expect(r.Order).toEqual([]);
  }
}
