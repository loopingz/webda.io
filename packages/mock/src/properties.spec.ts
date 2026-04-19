import { expect } from "vitest";
import { suite, test } from "@webda/test";
import fc from "fast-check";
import { Mock } from "@webda/models";
import { generate } from "./engine/generate.js";

class Simple {
  @Mock.integer({ min: 0, max: 10 }) accessor n!: number;
  @Mock.email accessor email!: string;
}

@suite("properties — generate")
class GeneratePropertiesTest {
  @test({ name: "always returns exactly `count` instances with every hinted field populated" })
  async alwaysReturnsCount() {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 1000 }),
        async (count, seed) => {
          const rows = await generate(Simple, { count, seed, mode: "test" });
          expect(rows.length).toBe(count);
          for (const r of rows) {
            expect(typeof r.n).toBe("number");
            expect(r.email).toMatch(/@/);
          }
        }
      ),
      { numRuns: 50 }
    );
  }
}
