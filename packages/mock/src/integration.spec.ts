import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { Mock } from "@webda/models";
import { generate, generateGraph } from "./index.js";

class Product {
  @Mock.word accessor name!: string;
  @Mock.float({ min: 1, max: 100 }) accessor price!: number;
  @Mock.percentage accessor discount!: number;
}

class User {
  @Mock.firstName accessor firstName!: string;
  @Mock.email accessor email!: string;
  @Mock.recentDate accessor lastLoginAt!: Date;
}

@suite("integration — multi-model, mixed kinds, seeded")
class MockIntegrationTest {
  @test({ name: "generateGraph produces the requested counts with matching types" })
  async graph() {
    const r = await generateGraph(
      { User: 4, Product: 6 },
      { models: [User, Product], seed: 7, mode: "test" }
    );
    expect(r.User.length).toBe(4);
    expect(r.Product.length).toBe(6);
    for (const u of r.User as User[]) {
      expect(u.email).toMatch(/@/);
      expect(u.lastLoginAt).toBeInstanceOf(Date);
    }
    for (const p of r.Product as Product[]) {
      expect(typeof p.name).toBe("string");
      expect(p.price).toBeGreaterThanOrEqual(1);
      expect(p.price).toBeLessThanOrEqual(100);
      expect(p.discount).toBeGreaterThanOrEqual(0);
      expect(p.discount).toBeLessThanOrEqual(100);
    }
  }

  @test({ name: "overrides win over decorators" })
  async overrides() {
    const [u] = await generate(User, {
      count: 1,
      seed: 1,
      mode: "test",
      overrides: { email: "fixed@example.com" }
    });
    expect(u.email).toBe("fixed@example.com");
  }
}
