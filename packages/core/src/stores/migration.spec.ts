import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { useModel } from "../application/hooks.js";
import { MemoryStore } from "./memory.service.js";

@suite
class MemoryRawAccessTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  /**
   * @returns a store holding a Webda 3 plain row, a Webda 4 envelope and an untyped row
   */
  rawStore(): MemoryStore {
    const store = new MemoryStore("raw", { models: ["Webda/RegistryEntry"] } as any);
    store.storage.set("b", JSON.stringify({ uuid: "b", __type: "User" }));
    store.storage.set("a", JSON.stringify({ $serializer: { type: "x" }, value: { uuid: "a" }, __type: "Webda/User" }));
    store.storage.set("c", JSON.stringify({ uuid: "c" }));
    return store;
  }

  @test
  async pagesEveryRowInKeyOrder() {
    const store = this.rawStore();
    const first = await store.rawPages("raw", 2);
    assert.deepStrictEqual(
      first.rows.map(row => row.key),
      ["a", "b"]
    );
    assert.strictEqual(first.rows[0].table, "raw");
    assert.strictEqual(first.rows[0].data.__type, "Webda/User");
    assert.strictEqual(first.rows[1].data.__type, "User");
    assert.strictEqual(first.continuationToken, "b");
    // The token is the last key: a row deleted meanwhile does not shift the next page
    store.storage.delete("a");
    const second = await store.rawPages("raw", 2, first.continuationToken);
    assert.deepStrictEqual(
      second.rows.map(row => row.key),
      ["c"]
    );
    assert.strictEqual(second.continuationToken, undefined);
  }

  @test
  async patchMergesTopLevelFields() {
    const store = this.rawStore();
    await store.rawPatch("raw", "a", { __type: "WebdaDemo/User" });
    assert.deepStrictEqual(JSON.parse(store.storage.get("a")!), {
      $serializer: { type: "x" },
      value: { uuid: "a" },
      __type: "WebdaDemo/User"
    });
    await assert.rejects(() => store.rawPatch("raw", "missing", { __type: "x" }), /Raw row not found: missing/);
    await assert.rejects(() => store.rawPatch("other", "a", {}), /Unknown table other/);
  }

  @test
  async unreadableAndObjectRows() {
    // Review focus: a corrupted row, and a v3 persistence file loaded as objects
    const store = this.rawStore();
    store.storage.set("broken", "{not json");
    (store.storage as Map<string, any>).set("old", { uuid: "old", __type: "User" });
    const page = await store.rawPages("raw", 10);
    const broken = page.rows.find(row => row.key === "broken")!;
    assert.strictEqual(broken.unreadable, true);
    assert.deepStrictEqual(broken.data, {});
    assert.strictEqual(page.rows.find(row => row.key === "old")!.data.__type, "User");
    await store.rawPatch("raw", "old", { __type: "Webda/User" });
    assert.strictEqual(JSON.parse(store.storage.get("old")!).__type, "Webda/User");
    await assert.rejects(() => store.rawPatch("raw", "broken", {}), /cannot be patched/);
  }

  @test
  async rawTablesUseTheStoreName() {
    const store = new MemoryStore("raw", { models: ["Webda/RegistryEntry"] } as any).resolve();
    const RegistryEntry = useModel("Webda/RegistryEntry");
    assert.deepStrictEqual(store.getRawTables(), [{ name: "raw", root: RegistryEntry }]);
    assert.strictEqual((store.getRepository(RegistryEntry as any) as any).getTableRoot(), RegistryEntry);
  }
}
