import { User } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import { vi } from "vitest";
import { FieldValue } from "@google-cloud/firestore";
import * as WebdaQL from "@webda/ql";
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
  async repositoryOptionalArguments() {
    const repository: any = new FireStoreRepository(User, ["uuid"], {} as any, "unit", [{ name: "asc", age: "desc" }]);
    // The declared orders of a compound index, keyed by its sorted fields
    assert.deepStrictEqual(repository.compoundIndexes, {
      "age/name": { name: new Set(["asc"]), age: new Set(["desc"]) }
    });
    const update = vi.fn();
    const ref = vi.spyOn(repository, "getDocumentRef").mockReturnValue({ id: "unit", update });
    try {
      // An object built without saving it
      const user = await repository.create({ uuid: "unsaved" }, false);
      assert.strictEqual(user.uuid, "unsaved");
      assert.strictEqual(ref.mock.calls.length, 0);

      // Increments as names, as properties with or without value, or as a map
      await repository.incrementAttributes("unit", ["a", { property: "b" }, { property: "c", value: 3 }]);
      let args = update.mock.calls[0][0];
      assert.deepStrictEqual(Object.keys(args), ["_lastUpdate", "a", "b", "c"]);
      assert.ok(args.a.isEqual(FieldValue.increment(1)));
      assert.ok(args.b.isEqual(FieldValue.increment(1)));
      assert.ok(args.c.isEqual(FieldValue.increment(3)));
      await repository.incrementAttributes("unit", { d: 2 });
      args = update.mock.calls[1][0];
      assert.ok(args.d.isEqual(FieldValue.increment(2)));

      // Deleting an item of a collection
      const data: any = { items: "not a list" };
      const written = vi.fn();
      repository.firestore.runTransaction = async (callback: any) =>
        callback({ get: async () => ({ exists: true, data: () => data }), update: written });
      await repository.deleteItemFromCollection("unit", "items", 0);
      assert.strictEqual(written.mock.calls.length, 0, "Nothing to delete in something else than a list");
      data.items = [{ name: "first" }, { name: "second" }];
      await repository.deleteItemFromCollection("unit", "items", 0);
      assert.deepStrictEqual(written.mock.calls[0][1].items, [{ name: "second" }]);
      await assert.rejects(() => repository.deleteItemFromCollection("unit", "items", 0, "name", "other"));
      await repository.deleteItemFromCollection("unit", "items", 0, "name", "second");
      assert.deepStrictEqual(written.mock.calls[1][1].items, []);

      // A query object goes back through the grammar
      const find = vi.spyOn(repository, "find").mockResolvedValue({ results: [], continuationToken: "next" });
      assert.deepStrictEqual(await repository.query(WebdaQL.parse("name = 'a' LIMIT 10")), {
        results: [],
        continuationToken: "next"
      });
      assert.strictEqual(find.mock.calls[0][0].limit, 10);
      assert.throws(() => WebdaQL.assertFilterQuery(WebdaQL.parse("DELETE WHERE name = 'a'")));
      await assert.rejects(() => repository.query(WebdaQL.parse("DELETE WHERE name = 'a'")));
    } finally {
      ref.mockRestore();
    }
  }

  @test
  async collectionsOfTheStore() {
    const store = (params: any) => new FireStore("fs-collections", new FireStoreParameters().load(params));
    class Other extends User {}
    (Other as any).Metadata = { ...(User as any).Metadata, Identifier: "Test/Other" };
    // Named after the model without collection
    assert.strictEqual(store({}).resolveCollection(User), "webda_user");
    // A single collection for the only (or the first) model of the store
    assert.strictEqual(store({ collection: "shared" }).resolveCollection(User), "shared");
    const several = store({ collection: "shared", models: ["Webda/User", "Test/Other"] });
    assert.strictEqual(several.resolveCollection(User), "shared");
    assert.strictEqual(several.resolveCollection(Other as any), "test_other");
    // No repository before the models are resolved
    (several as any)._modelsHierarchy = undefined;
    assert.deepStrictEqual(several.getRepositories(), []);
    // A repository that is not wrapped is returned as is
    (several as any)._modelsHierarchy = { "Webda/User": 0 };
    const bare = new FireStoreRepository(User, ["uuid"], {} as any, "unit");
    const getRepository = vi.spyOn(several, "getRepository").mockReturnValue(bare as any);
    try {
      assert.deepStrictEqual(several.getRepositories(), [bare]);
    } finally {
      getRepository.mockRestore();
    }
  }

  @test
  async additionalGcpUnitCoverage() {
    // 1. fromFirestore without .load(), deleteMany, updateMany
    class PlainModel {
      a?: number;
    }
    const plainRepo = new FireStoreRepository(PlainModel as any, ["uuid"], {} as any, "unit");
    const inst = (plainRepo as any).fromFirestore({ a: 42 });
    assert.strictEqual(inst.a, 42);
    // A repository built without a logger drops its warnings
    assert.strictEqual((plainRepo as any).log("WARN", "Compound index not defined"), undefined);
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
