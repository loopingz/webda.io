import { User } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import { vi } from "vitest";
import FireStore, { FireStoreParameters, FireStoreRepository, toFirestore } from "./firestore.service.js";
import { GCPQueue, GCPQueueParameters } from "./queue.service.js";
import { GCSFinder } from "./storage.service.js";

@suite
class FireStoreErrorsTest extends WebdaApplicationTest {
  @test
  async rejectsPrototypeCollectionIndexes() {
    const transaction = vi.fn();
    const repository = new FireStoreRepository(User, ["uuid"], { runTransaction: transaction } as any, "unit");
    const ref = vi.spyOn(repository as any, "getDocumentRef").mockReturnValue({ id: "unit" });
    try {
      for (const index of ["__proto__", "constructor", -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        await assert.rejects(
          () => repository.upsertItemToCollection("unit", "items", {}, index as any),
          /non-negative safe integer/
        );
      }
      assert.strictEqual(transaction.mock.calls.length, 0);
      const update = vi.fn();
      const data: any = {};
      transaction.mockImplementation(async callback =>
        callback({
          get: async () => ({ exists: true, data: () => data }),
          update
        })
      );
      await repository.upsertItemToCollection("unit", "__proto__", "safe", 0);
      const fields = update.mock.calls[0][1];
      assert.ok(Object.hasOwn(fields, "__proto__"));
      assert.deepStrictEqual(fields.__proto__, ["safe"]);
      assert.strictEqual(Object.getPrototypeOf(fields), Object.prototype);
      data.items = [{ name: "old" }];
      await repository.upsertItemToCollection("unit", "items", { name: "new" }, 0, "name", "old");
      assert.deepStrictEqual(update.mock.calls.at(-1)![1].items, [{ name: "new" }]);
      data.items = {};
      await assert.rejects(() => repository.upsertItemToCollection("unit", "items", "value", 0), /must be an array/);
    } finally {
      ref.mockRestore();
    }
  }

  @test
  async preservesUnexpectedCreateFailuresAndTranslatesDuplicates() {
    const repository = new FireStoreRepository(User, ["uuid"], {} as any, "unit");
    const ref = vi.spyOn(repository as any, "getDocumentRef");
    try {
      for (const error of [null, "failure", new Error("failure"), { code: 13 }]) {
        ref.mockReturnValue({
          create: async () => {
            throw error;
          }
        });
        await assert.rejects(
          () => repository.create({ uuid: "unit" }),
          thrown => thrown === error
        );
      }
      ref.mockReturnValue({
        create: async () => {
          throw { code: 6 };
        }
      });
      await assert.rejects(() => repository.create({ uuid: "unit" }), /Already exists: unit/);
    } finally {
      ref.mockRestore();
    }
  }

  @test
  async additionalGcpUnitCoverage() {
    // 1. fromFirestore without .load(), deleteMany, updateMany
    class PlainModel {
      a?: number;
    }
    const plainRepo = new FireStoreRepository(PlainModel as any, ["uuid"], {} as any, "unit");
    (plainRepo as any).log("WARN", "noop");
    const inst = (plainRepo as any).fromFirestore({ a: 42 });
    assert.strictEqual(inst.a, 42);
    const selfJson: any = { x: 1 };
    selfJson.toJSON = () => selfJson;
    assert.deepStrictEqual(toFirestore(selfJson), { x: 1 });

    const delSpy = vi.spyOn(plainRepo as any, "deleteManyByKey").mockResolvedValue(3);
    const updSpy = vi.spyOn(plainRepo as any, "updateManyByKey").mockResolvedValue(2);
    assert.strictEqual(await plainRepo.deleteMany("DELETE"), 3);
    assert.strictEqual(await plainRepo.updateMany("UPDATE SET a = 1"), 2);
    delSpy.mockRestore();
    updSpy.mockRestore();

    // 2. FireStore resolveCollection (!meta), getRepositories (missing/null model), __clean (duplicate collection)
    class NoMetaUser extends User {}
    delete (NoMetaUser as any).Metadata;
    const store = new FireStore(
      "fs-unit",
      new FireStoreParameters().load({
        collection: "shared",
        collections: { "Webda/User": "shared", "Webda/OwnerModel": "shared" }
      })
    );
    store.firestore = {
      collection: () => ({ listDocuments: async () => [] })
    } as any;
    assert.strictEqual(store.resolveCollection(NoMetaUser as any), "shared");

    (store as any)._modelsHierarchy = {
      "Missing/Model": {},
      "Null/Model": {},
      "Webda/User": {},
      "Webda/OwnerModel": {}
    };
    const app = this.getApplication();
    const origGetModel = app.getModel.bind(app);
    app.getModel = ((name: string) => {
      if (name === "Null/Model") return undefined as any;
      return origGetModel(name);
    }) as any;
    try {
      await store.__clean();
    } finally {
      app.getModel = origGetModel;
    }

    // 3. GCPQueue receiver error listener (line 180)
    const q = this.registerService(
      new GCPQueue(
        "gcp-q",
        new GCPQueueParameters().load({ mode: "receiver", subscription: "s", topic: "t", timeout: 10 })
      )
    ).resolve();
    const subEmitter = new EventEmitter();
    q.pubsub = {
      subscription: () => subEmitter
    } as any;
    const p = q.receiveMessage();
    subEmitter.emit("error", new Error("receiver error"));
    assert.deepStrictEqual(await p, []);

    // 4. GCSFinder find with filterPattern mismatch (line 175)
    const finder = new GCSFinder();
    (finder as any)._storage = {
      bucket: () => ({
        getFiles: async () => [[{ name: "skip.txt" }, { name: "keep.json" }], undefined]
      })
    };
    const found = await finder.find("gs://my-bucket/", { filterPattern: /\.json$/ });
    assert.deepStrictEqual(found, ["gs://my-bucket/keep.json"]);
  }
}
