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

/**
 * Mimics the store repositories (Dynamo, Mongo, Postgres, Firestore): extends MemoryRepository with an
 * empty map and keeps the data in its own backend
 */
class BackendRepository extends MemoryRepository<typeof Counter> {
  backend: Record<string, any> = {};

  /** @override */
  async create(data: any): Promise<any> {
    this.backend[this.getPrimaryKey(data).toString()] = { ...data };
    return data;
  }

  /** @override */
  async get(primaryKey: any): Promise<any> {
    const item = this.backend[this.getPrimaryKey(primaryKey).toString()];
    if (!item) throw new Error("Backend not found");
    return Object.assign(new Counter(), item);
  }

  /** @override */
  async patch(primaryKey: any, data: any): Promise<void> {
    Object.assign(this.backend[this.getPrimaryKey(primaryKey).toString()], data);
  }

  /** @override */
  async incrementAttributes(primaryKey: any, info: any): Promise<void> {
    const item = this.backend[this.getPrimaryKey(primaryKey).toString()];
    for (const entry of info) {
      const prop = typeof entry === "string" ? entry : entry.property;
      item[prop] = (item[prop] ?? 0) + (typeof entry === "string" ? 1 : (entry.value ?? 1));
    }
  }
}

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
  async storeSubclassAtomicOpsUseTheBackend() {
    const repo = new BackendRepository(Counter, ["uuid"], ":", new Map());
    await repo.create(new Counter({ uuid: "c" } as any));
    const ref = repo.ref("c" as any);
    // Store repositories extend MemoryRepository with an empty map: atomic ops must reach their backend
    await ref.setAttribute("count" as any, 5 as any);
    assert.strictEqual(repo.backend.c.count, 5);
    await ref.incrementAttribute("count" as any);
    assert.strictEqual(repo.backend.c.count, 6);
    assert.strictEqual(((await ref.get()) as any).count, 6);
  }

  @test
  async prototypeKeysAreRejected() {
    const repo = new MemoryRepository(Counter, ["uuid"], ":", new Map());
    await repo.create(new Counter({ uuid: "c" } as any));
    const ref = repo.ref("c" as any);
    for (const path of ["__proto__.polluted", "constructor.prototype.x", "nested.__proto__.polluted"]) {
      await assert.rejects(() => ref.incrementAttribute(path as any), /Invalid path segment/);
    }
    assert.strictEqual(({} as any).polluted, undefined);
    assert.strictEqual(({} as any).x, undefined);
  }
}
