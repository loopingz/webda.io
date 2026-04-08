import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { FileStore, FileStoreParameters } from "./filestore.js";
import { StoreNotFoundError, UpdateConditionFailError, runWithInstanceStorage } from "@webda/core";

/**
 * Helper to create a FileStore instance with proper parameters,
 * bypassing the full Webda application bootstrap.
 */
function createFileStore(folder: string, opts: Record<string, any> = {}): FileStore {
  const params = new FileStoreParameters().load({ folder, ...opts });
  const store = new FileStore("testFileStore", params);
  // Ensure the folder exists
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  return store;
}

/**
 * Remove a directory and all contents recursively.
 */
function rmrf(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

@suite
class FileBackedMapTest {
  tmpDir: string;
  store: FileStore;

  beforeEach() {
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fbm-test-"));
    this.store = createFileStore(this.tmpDir);
  }

  afterEach() {
    rmrf(this.tmpDir);
  }

  /**
   * Access the FileBackedMap through the store's getRepository method.
   * Instead, we test via the store's file-based operations which use the same backing.
   */

  @test
  async hasReturnsFalseForMissing() {
    const exists = await this.store._exists("nonexistent");
    assert.strictEqual(exists, false);
  }

  @test
  async hasReturnsTrueForExisting() {
    fs.writeFileSync(path.join(this.tmpDir, "item1.json"), JSON.stringify({ uuid: "item1" }));
    const exists = await this.store._exists("item1");
    assert.strictEqual(exists, true);
  }

  @test
  async getReturnsUndefinedForMissing() {
    const result = await this.store._get("nonexistent");
    assert.strictEqual(result, undefined);
  }

  @test
  async getReturnsDataForExisting() {
    const data = { uuid: "item2", name: "test" };
    fs.writeFileSync(path.join(this.tmpDir, "item2.json"), JSON.stringify(data));
    const result = await this.store._get("item2");
    assert.deepStrictEqual(result, data);
  }

  @test
  async getRaisesIfNotFound() {
    await assert.rejects(() => this.store._get("missing", true), StoreNotFoundError);
  }

  @test
  async createWritesFile() {
    const data = { uuid: "new1", name: "created" };
    const result = await this.store._create("new1", data);
    assert.deepStrictEqual(result, data);
    assert.ok(fs.existsSync(path.join(this.tmpDir, "new1.json")));
    const stored = JSON.parse(fs.readFileSync(path.join(this.tmpDir, "new1.json"), "utf-8"));
    assert.deepStrictEqual(stored, data);
  }

  @test
  async createFailsIfExists() {
    fs.writeFileSync(path.join(this.tmpDir, "dup.json"), "{}");
    await assert.rejects(() => this.store._create("dup", { uuid: "dup" }));
  }

  @test
  async updateReplacesObject() {
    const original = { uuid: "upd1", name: "original", version: 1 };
    fs.writeFileSync(path.join(this.tmpDir, "upd1.json"), JSON.stringify(original));
    const updated = { uuid: "upd1", name: "updated", version: 2 };
    const result = await this.store._update(updated, "upd1");
    assert.deepStrictEqual(result, updated);
    const stored = JSON.parse(fs.readFileSync(path.join(this.tmpDir, "upd1.json"), "utf-8"));
    assert.deepStrictEqual(stored, updated);
  }

  @test
  async updateWithConditionSuccess() {
    const original = { uuid: "uc1", name: "orig", version: 1 };
    fs.writeFileSync(path.join(this.tmpDir, "uc1.json"), JSON.stringify(original));
    const updated = { uuid: "uc1", name: "new", version: 2 };
    const result = await this.store._update(updated, "uc1", 1, "version");
    assert.deepStrictEqual(result, updated);
  }

  @test
  async updateWithConditionFailure() {
    const original = { uuid: "uc2", name: "orig", version: 1 };
    fs.writeFileSync(path.join(this.tmpDir, "uc2.json"), JSON.stringify(original));
    const updated = { uuid: "uc2", name: "new", version: 2 };
    await assert.rejects(() => this.store._update(updated, "uc2", 999, "version"), UpdateConditionFailError);
  }

  @test
  async patchMergesProperties() {
    const original = { uuid: "p1", name: "orig", extra: "keep" };
    fs.writeFileSync(path.join(this.tmpDir, "p1.json"), JSON.stringify(original));
    const result = await this.store._patch({ name: "patched" }, "p1");
    assert.strictEqual(result.name, "patched");
    assert.strictEqual(result.extra, "keep");
  }

  @test
  async patchWithConditionSuccess() {
    const original = { uuid: "pc1", name: "orig", version: 5 };
    fs.writeFileSync(path.join(this.tmpDir, "pc1.json"), JSON.stringify(original));
    const result = await this.store._patch({ name: "patched" }, "pc1", 5, "version");
    assert.strictEqual(result.name, "patched");
  }

  @test
  async patchWithConditionFailure() {
    const original = { uuid: "pc2", name: "orig", version: 5 };
    fs.writeFileSync(path.join(this.tmpDir, "pc2.json"), JSON.stringify(original));
    await assert.rejects(() => this.store._patch({ name: "patched" }, "pc2", 10, "version"), UpdateConditionFailError);
  }

  @test
  async deleteRemovesFile() {
    fs.writeFileSync(path.join(this.tmpDir, "del1.json"), "{}");
    assert.ok(fs.existsSync(path.join(this.tmpDir, "del1.json")));
    await this.store._delete("del1");
    assert.ok(!fs.existsSync(path.join(this.tmpDir, "del1.json")));
  }

  @test
  async deleteNonExistentDoesNotThrow() {
    // Should not throw
    await this.store._delete("nonexistent");
  }

  @test
  async incrementAttributesCreatesAndIncrements() {
    const data = { uuid: "inc1" };
    fs.writeFileSync(path.join(this.tmpDir, "inc1.json"), JSON.stringify(data));
    const updateDate = new Date();
    const result = await this.store._incrementAttributes("inc1", [{ property: "counter", value: 5 }], updateDate);
    assert.strictEqual(result.counter, 5);
    assert.strictEqual(result._lastUpdate, updateDate);

    // Increment again
    const result2 = await this.store._incrementAttributes("inc1", [{ property: "counter", value: 3 }], updateDate);
    assert.strictEqual(result2.counter, 8);
  }

  @test
  async incrementAttributesMultipleProps() {
    const data = { uuid: "inc2", a: 10, b: 20 };
    fs.writeFileSync(path.join(this.tmpDir, "inc2.json"), JSON.stringify(data));
    const updateDate = new Date();
    const result = await this.store._incrementAttributes(
      "inc2",
      [
        { property: "a", value: 1 },
        { property: "b", value: -5 }
      ],
      updateDate
    );
    assert.strictEqual(result.a, 11);
    assert.strictEqual(result.b, 15);
  }

  @test
  async incrementAttributesThrowsIfNotFound() {
    await assert.rejects(
      () => this.store._incrementAttributes("missing", [{ property: "x", value: 1 }], new Date()),
      StoreNotFoundError
    );
  }

  @test
  async persistWithBeautify() {
    const beautifulStore = createFileStore(this.tmpDir, { beautify: 2 });
    const data = { uuid: "b1", name: "pretty" };
    await beautifulStore._create("b1", data);
    const raw = fs.readFileSync(path.join(this.tmpDir, "b1.json"), "utf-8");
    // With beautify=2, the output should be indented
    assert.ok(raw.includes("\n"));
    assert.ok(raw.includes("  "));
  }

  @test
  async persistWithoutBeautify() {
    const data = { uuid: "nb1", name: "compact" };
    await this.store._create("nb1", data);
    const raw = fs.readFileSync(path.join(this.tmpDir, "nb1.json"), "utf-8");
    // Without beautify, JSON is compact (single line)
    assert.ok(!raw.includes("\n"));
  }

  @test
  checkUpdateConditionNoField() {
    // When no writeConditionField, should not throw
    this.store["checkUpdateCondition"]("uuid1", { version: 1 }, undefined, undefined);
  }

  @test
  checkUpdateConditionMatch() {
    // When condition matches, should not throw
    this.store["checkUpdateCondition"]("uuid1", { version: 1 }, "version", 1);
  }

  @test
  checkUpdateConditionMismatch() {
    assert.throws(
      () => this.store["checkUpdateCondition"]("uuid1", { version: 1 }, "version", 2),
      UpdateConditionFailError
    );
  }

  @test
  checkCollectionUpdateConditionNoCondition() {
    // When itemWriteCondition is undefined, should not throw
    this.store["checkCollectionUpdateCondition"]({ items: [{ v: 1 }] }, "items", "v", undefined, 0);
  }

  @test
  checkCollectionUpdateConditionMatch() {
    // When condition matches, should not throw
    this.store["checkCollectionUpdateCondition"]({ items: [{ v: 1 }] }, "items", "v", 1, 0);
  }

  @test
  checkCollectionUpdateConditionMismatch() {
    assert.throws(
      () =>
        this.store["checkCollectionUpdateCondition"](
          { uuid: "test", items: [{ v: 1 }, { v: 2 }] },
          "items",
          "v",
          99,
          0
        ),
      UpdateConditionFailError
    );
  }

  @test
  async getAllWithoutUids() {
    fs.writeFileSync(path.join(this.tmpDir, "a.json"), JSON.stringify({ uuid: "a", name: "A" }));
    fs.writeFileSync(path.join(this.tmpDir, "b.json"), JSON.stringify({ uuid: "b", name: "B" }));
    const all = await this.store.getAll();
    assert.strictEqual(all.length, 2);
  }

  @test
  async getAllWithUids() {
    fs.writeFileSync(path.join(this.tmpDir, "x.json"), JSON.stringify({ uuid: "x" }));
    fs.writeFileSync(path.join(this.tmpDir, "y.json"), JSON.stringify({ uuid: "y" }));
    fs.writeFileSync(path.join(this.tmpDir, "z.json"), JSON.stringify({ uuid: "z" }));
    const result = await this.store.getAll(["x", "z"]);
    assert.strictEqual(result.length, 2);
  }

  @test
  async getAllWithMissingUids() {
    fs.writeFileSync(path.join(this.tmpDir, "x.json"), JSON.stringify({ uuid: "x" }));
    const result = await this.store.getAll(["x", "missing"]);
    assert.strictEqual(result.length, 1);
  }

  @test
  async getWithStrictMode() {
    const strictStore = createFileStore(this.tmpDir, { strict: true });
    // @ts-ignore - set _modelType for strict filtering
    strictStore._modelType = "MyModel";
    const data = { uuid: "strict1", __type: "OtherModel" };
    fs.writeFileSync(path.join(this.tmpDir, "strict1.json"), JSON.stringify(data));
    const result = await strictStore._get("strict1");
    assert.strictEqual(result, undefined);

    // With matching type
    const data2 = { uuid: "strict2", __type: "MyModel" };
    fs.writeFileSync(path.join(this.tmpDir, "strict2.json"), JSON.stringify(data2));
    const result2 = await strictStore._get("strict2");
    assert.deepStrictEqual(result2, data2);
  }

  @test
  computeParametersCreatesFolder() {
    const newDir = path.join(this.tmpDir, "subfolder");
    assert.ok(!fs.existsSync(newDir));
    const store = createFileStore(newDir);
    // computeParameters is called in resolve, but we call directly
    store.computeParameters();
    assert.ok(fs.existsSync(newDir));
  }

  @test
  computeParametersExistingFolder() {
    // Should not throw if folder already exists
    this.store.computeParameters();
    assert.ok(fs.existsSync(this.tmpDir));
  }

  @test
  filePathGeneration() {
    const filePath = this.store.file("myuuid");
    assert.strictEqual(filePath, path.join(this.tmpDir, "myuuid.json"));
  }

  @test
  async upsertItemToCollection() {
    const data = { uuid: "col1", items: [{ id: 1 }] };
    fs.writeFileSync(path.join(this.tmpDir, "col1.json"), JSON.stringify(data));
    const updateDate = new Date();
    const result = await this.store._upsertItemToCollection(
      "col1",
      "items",
      { id: 2 },
      undefined,
      undefined,
      undefined,
      updateDate
    );
    assert.strictEqual(result.items.length, 2);
    assert.deepStrictEqual(result.items[1], { id: 2 });
  }

  @test
  async upsertItemToCollectionAtIndex() {
    const data = { uuid: "col2", items: [{ id: 1 }, { id: 2 }] };
    fs.writeFileSync(path.join(this.tmpDir, "col2.json"), JSON.stringify(data));
    const updateDate = new Date();
    const result = await this.store._upsertItemToCollection(
      "col2",
      "items",
      { id: 99 },
      0,
      undefined,
      undefined,
      updateDate
    );
    assert.deepStrictEqual(result.items[0], { id: 99 });
  }

  @test
  async upsertItemToCollectionNotFound() {
    await assert.rejects(
      () =>
        this.store._upsertItemToCollection("nonexistent", "items", { id: 1 }, undefined, undefined, undefined, new Date()),
      StoreNotFoundError
    );
  }

  @test
  async upsertItemToCollectionWithConditionFail() {
    const data = { uuid: "colc", items: [{ id: 1, v: 10 }] };
    fs.writeFileSync(path.join(this.tmpDir, "colc.json"), JSON.stringify(data));
    await assert.rejects(
      () => this.store._upsertItemToCollection("colc", "items", { id: 2 }, 0, 99, "v", new Date()),
      UpdateConditionFailError
    );
  }

  @test
  async upsertItemCreatesCollectionIfMissing() {
    const data = { uuid: "colm" };
    fs.writeFileSync(path.join(this.tmpDir, "colm.json"), JSON.stringify(data));
    const updateDate = new Date();
    const result = await this.store._upsertItemToCollection(
      "colm",
      "tags",
      { name: "new" },
      undefined,
      undefined,
      undefined,
      updateDate
    );
    assert.ok(Array.isArray(result.tags));
    assert.strictEqual(result.tags.length, 1);
  }

  @test
  async deleteItemFromCollection() {
    const data = { uuid: "cold", items: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    fs.writeFileSync(path.join(this.tmpDir, "cold.json"), JSON.stringify(data));
    const updateDate = new Date();
    const result = await this.store._deleteItemFromCollection("cold", "items", 1, undefined, undefined, updateDate);
    assert.strictEqual(result.items.length, 2);
    assert.deepStrictEqual(result.items[0], { id: 1 });
    assert.deepStrictEqual(result.items[1], { id: 3 });
  }

  @test
  async removeAttribute() {
    const data = { uuid: "ra1", name: "test", extra: "remove" };
    fs.writeFileSync(path.join(this.tmpDir, "ra1.json"), JSON.stringify(data));
    await this.store._removeAttribute("ra1", "extra");
    const stored = JSON.parse(fs.readFileSync(path.join(this.tmpDir, "ra1.json"), "utf-8"));
    assert.strictEqual(stored.extra, undefined);
    assert.strictEqual(stored.name, "test");
  }

  @test
  async removeAttributeWithCondition() {
    const data = { uuid: "ra2", name: "test", version: 1 };
    fs.writeFileSync(path.join(this.tmpDir, "ra2.json"), JSON.stringify(data));
    await this.store._removeAttribute("ra2", "name", 1, "version");
    const stored = JSON.parse(fs.readFileSync(path.join(this.tmpDir, "ra2.json"), "utf-8"));
    assert.strictEqual(stored.name, undefined);
  }

  @test
  async removeAttributeWithConditionFail() {
    const data = { uuid: "ra3", name: "test", version: 1 };
    fs.writeFileSync(path.join(this.tmpDir, "ra3.json"), JSON.stringify(data));
    await assert.rejects(
      () => this.store._removeAttribute("ra3", "name", 99, "version"),
      UpdateConditionFailError
    );
  }

  @test
  loadParametersReturnsFileStoreParameters() {
    const result = this.store.loadParameters({ folder: "/tmp/test", beautify: 2, model: "Test" });
    assert.ok(result instanceof FileStoreParameters);
    assert.strictEqual(result.folder, "/tmp/test");
    assert.strictEqual(result.beautify, 2);
  }

  @test
  loadParametersDefaultBeautify() {
    const result = this.store.loadParameters({ folder: "/tmp/test" });
    assert.strictEqual(result.beautify, undefined);
  }

  @test
  async cleanDeletesAllFiles() {
    // Create some files
    fs.writeFileSync(path.join(this.tmpDir, "a.json"), "{}");
    fs.writeFileSync(path.join(this.tmpDir, "b.json"), "{}");
    assert.strictEqual(fs.readdirSync(this.tmpDir).length, 2);

    // Use fs-extra emptyDirSync via __clean
    await this.store.__clean();
    assert.strictEqual(fs.readdirSync(this.tmpDir).length, 0);
  }

  @test
  async deleteItemFromCollectionWithConditionFail() {
    const data = { uuid: "coldf", items: [{ id: 1, v: 10 }, { id: 2, v: 20 }] };
    fs.writeFileSync(path.join(this.tmpDir, "coldf.json"), JSON.stringify(data));
    await assert.rejects(
      () => this.store._deleteItemFromCollection("coldf", "items", 0, 99, "v", new Date()),
      UpdateConditionFailError
    );
  }

  @test
  async upsertItemWithWriteConditionSuccess() {
    const data = { uuid: "colws", items: [{ id: 1, v: 10 }] };
    fs.writeFileSync(path.join(this.tmpDir, "colws.json"), JSON.stringify(data));
    const result = await this.store._upsertItemToCollection(
      "colws",
      "items",
      { id: 99 },
      0,
      10,
      "v",
      new Date()
    );
    assert.deepStrictEqual(result.items[0], { id: 99 });
  }

  @test
  async patchNotFoundRaises() {
    await assert.rejects(
      () => this.store._patch({ name: "test" }, "nonexistent", undefined, undefined),
      StoreNotFoundError
    );
  }

  @test
  async updateNotFoundRaises() {
    await assert.rejects(
      () => this.store._update({ name: "test" }, "nonexistent", undefined, undefined),
      StoreNotFoundError
    );
  }

  @test
  async persistBehavior() {
    // Test persist directly by calling _create and then _patch
    const data = { uuid: "persist1", name: "test" };
    await this.store._create("persist1", data);
    const patched = await this.store._patch({ name: "updated", extra: "added" }, "persist1");
    assert.strictEqual(patched.name, "updated");
    assert.strictEqual(patched.extra, "added");
    assert.strictEqual(patched.uuid, "persist1");
    // Verify it was persisted to disk
    const stored = JSON.parse(fs.readFileSync(path.join(this.tmpDir, "persist1.json"), "utf-8"));
    assert.strictEqual(stored.name, "updated");
    assert.strictEqual(stored.extra, "added");
  }

  @test
  async getAllWithSubdirectories() {
    // Create a file and a subdirectory (without .json extension)
    fs.writeFileSync(path.join(this.tmpDir, "file1.json"), JSON.stringify({ uuid: "file1" }));
    fs.mkdirSync(path.join(this.tmpDir, "subdir"));
    const all = await this.store.getAll();
    // getAll lists .json files only, subdirectory without .json ext is ignored
    assert.strictEqual(all.length, 1);
    assert.deepStrictEqual(all[0], { uuid: "file1" });
  }

  @test
  async deleteItemFromCollectionNotFound() {
    await assert.rejects(
      () => this.store._deleteItemFromCollection("missing", "items", 0, undefined, undefined, new Date()),
      StoreNotFoundError
    );
  }

  @test
  async removeAttributeNotFound() {
    await assert.rejects(() => this.store._removeAttribute("missing", "attr"), StoreNotFoundError);
  }

  @test
  async getRepositoryAndFileBackedMap() {
    await runWithInstanceStorage({}, async () => {
      // Create a mock model class with Metadata property
      const MockModel: any = class MockModel {};
      MockModel.Metadata = {
        Identifier: "Test/MockModel",
        PrimaryKey: ["uuid"],
        Subclasses: []
      };

      const repo = this.store.getRepository(MockModel);
      assert.ok(repo);

      // Test the underlying FileBackedMap through the repo's storage
      const storage = (repo as any).storage;
      assert.ok(storage);

      // Test set/get
      const testData = JSON.stringify({ uuid: "test1", name: "hello" });
      storage.set("test1", testData);
      assert.ok(storage.has("test1"));
      assert.strictEqual(storage.get("test1"), testData);

      // Verify file was created on disk
      assert.ok(fs.existsSync(path.join(this.tmpDir, "test1.json")));

      // Test keys
      storage.set("test2", JSON.stringify({ uuid: "test2" }));
      const keys = [...storage.keys()];
      assert.ok(keys.includes("test1"));
      assert.ok(keys.includes("test2"));

      // Test iterator (Symbol.iterator)
      const entries = [...storage];
      assert.ok(entries.length >= 2);
      assert.ok(entries.some(([k]) => k === "test1"));

      // Test delete existing
      assert.ok(storage.delete("test1"));
      assert.ok(!storage.has("test1"));
      assert.ok(!fs.existsSync(path.join(this.tmpDir, "test1.json")));

      // Test delete non-existent
      assert.ok(!storage.delete("nonexistent"));

      // Test get non-existent
      assert.strictEqual(storage.get("nonexistent"), undefined);

      // Test clear
      storage.clear();
      assert.strictEqual([...storage.keys()].length, 0);
    });
  }

  @test
  async fileBackedMapEdgeCases() {
    await runWithInstanceStorage({}, async () => {
      const MockModel: any = class MockModel {};
      MockModel.Metadata = {
        Identifier: "Test/MockModel2",
        PrimaryKey: ["uuid"],
        Subclasses: []
      };

      const repo = this.store.getRepository(MockModel);
      const storage = (repo as any).storage;

      // Test clear on empty folder
      storage.clear();
      assert.strictEqual([...storage.keys()].length, 0);

      // Test clear ignores non-json files
      fs.writeFileSync(path.join(this.tmpDir, "readme.txt"), "not json");
      storage.set("item1", "{}");
      storage.clear();
      assert.ok(fs.existsSync(path.join(this.tmpDir, "readme.txt")));
      assert.ok(!fs.existsSync(path.join(this.tmpDir, "item1.json")));
    });
  }

  @test
  async fileBackedMapKeysNonExistentFolder() {
    await runWithInstanceStorage({}, async () => {
      const nonExistentDir = path.join(this.tmpDir, "nonexistent_subfolder");
      const store = createFileStore(nonExistentDir);
      rmrf(nonExistentDir);

      const MockModel: any = class MockModel {};
      MockModel.Metadata = {
        Identifier: "Test/MockModel3",
        PrimaryKey: ["uuid"],
        Subclasses: []
      };

      const repo = store.getRepository(MockModel);
      const storage = (repo as any).storage;

      // keys() on non-existent folder returns empty
      const keys = [...storage.keys()];
      assert.strictEqual(keys.length, 0);

      // clear on non-existent folder doesn't throw
      storage.clear();
    });
  }
}

export { FileBackedMapTest };
