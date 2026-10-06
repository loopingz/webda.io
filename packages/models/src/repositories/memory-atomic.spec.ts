import { suite, test } from "@webda/test";
import * as assert from "assert";
import { UuidModel } from "../model.model.js";
import { MemoryRepository } from "./memory";

/** Model with a nested counter */
class Counter extends UuidModel {
  count: number = 0;
  nested: { n?: number; at?: number } = {};
}
Counter.registerSerializer();
(Counter as any).Metadata = { Identifier: "Test/Counter", Subclasses: [] };

@suite
class MemoryAtomicTest {
  @test
  async parallelIncrementsAreAllCounted() {
    const repo = new MemoryRepository(Counter, ["uuid"], ":", new Map());
    await repo.create(new Counter({ uuid: "c" } as any));
    const results: any[] = await Promise.all(
      Array.from({ length: 10 }, () => repo.incrementAttributes("c", [{ property: "nested.n" as any }, "count" as any]))
    );
    const item: any = await repo.get("c");
    assert.strictEqual(item.nested.n, 10);
    assert.strictEqual(item.count, 10);
    // Each call gets its own post-increment value
    assert.deepStrictEqual(
      results.map(r => r["nested.n"]).sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    );
  }

  @test
  async setAttributeNestedKeepsSiblings() {
    const repo = new MemoryRepository(Counter, ["uuid"], ":", new Map());
    await repo.create(new Counter({ uuid: "c" } as any));
    await repo.incrementAttributes("c", [{ property: "nested.n" as any, value: 4 }]);
    await repo.setAttribute("c", "nested.at" as any, 99 as any);
    const item: any = await repo.get("c");
    assert.deepStrictEqual({ ...item.nested }, { n: 4, at: 99 });
  }
}
