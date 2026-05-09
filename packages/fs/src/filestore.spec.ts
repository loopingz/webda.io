import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import pkg from "fs-extra";
import * as sinon from "sinon";
import { CoreModel, Store, StoreNotFoundError, UpdateConditionFailError, User } from "@webda/core";
import { StoreTest, IdentTest, UserTest } from "@webda/core/lib/stores/store.spec";
import { FileStore } from "./filestore.js";
const { removeSync } = pkg;

/**
 * Cast for test user
 */
interface TestUser extends User {
  _testor: any;
  type: string;
  additional: string;
  user: string;
}
@suite
class FileStoreTest extends StoreTest<FileStore<any>> {
  async getUserStore(): Promise<FileStore<any>> {
    return this.addService(FileStore, { folder: "./test/data/idents", model: "Webda/User" }, "Users");
  }

  async getIdentStore(): Promise<FileStore<any>> {
    const identStore = new FileStore("Idents", {
      model: "WebdaTest/Ident",
      folder: "./test/data/idents"
    });
    // @ts-ignore
    const original = identStore._get.bind(identStore);
    // @ts-ignore
    identStore._get = async (...args) => {
      await this.sleep(1);
      return original(...args);
    };
    return await identStore.resolve().init();
  }

  @test
  async update(delay: number = 100) {
    // Increase the delay for FileStore
    return super.update(delay);
  }

  @test
  async cov() {
    const user = await UserTest.create({});
    let ident = await IdentTest.create({
      _user: user.getUuid()
    });
    const identStore: FileStore = this.identStore;
    IdentTest.store().getParameters().strict = true;
    let res = await IdentTest.get(user.getUuid());
    assert.strictEqual(res, undefined);
    const stub = sinon.stub(identStore, "_get").callsFake(async () => user);
    try {
      res = await IdentTest.get(user.getUuid());
      assert.strictEqual(res, undefined);
      await assert.rejects(
        () =>
          IdentTest.ref(user.getUuid()).patch({
            plop: 1
          }),
        StoreNotFoundError
      );
      await user.refresh();
      assert.strictEqual(user["plop"], undefined);
      user.idents ??= [];
      user.idents.push(<any>{ uuid: ident.getUuid() });
      const user2 = await UserTest.create(user, false);
      await IdentTest.ref(user2.getUuid()).delete();
    } finally {
      stub.restore();
    }

    const ref = IdentTest.ref("test");
    ref.incrementAttribute("counter", 12);
    await IdentTest["Store"].create("test_cache", {});
    await identStore.get("test_cache");
    assert.notStrictEqual(await identStore["_cacheStore"].get("test_cache"), undefined);
    identStore.emitStoreEvent("Store.PartialUpdated", {
      object_id: "test_cache",
      partial_update: {},
      store: identStore
    });
    assert.strictEqual(await identStore["_cacheStore"].get("test"), undefined);
    // Shoud return directly
    await ref.incrementAttribute("counter", 0);
    removeSync(identStore.getParameters().folder);
    // Should not fail
    await identStore.__clean();
    // Should recreate folder
    identStore.computeParameters();
    existsSync(identStore.getParameters().folder);

    ident = <any>new this.identStore._model();
    assert.notStrictEqual(ident.getUuid(), undefined);

    // Test guard-rails (seems hardly reachable so might be useless)
    assert.throws(
      () => identStore["checkCollectionUpdateCondition"](ident, "plops", undefined, 1, null),
      UpdateConditionFailError
    );
    // @ts-ignore
    ident.plops = [];
    assert.throws(
      () => identStore["checkCollectionUpdateCondition"](ident, "plops", undefined, 1, null),
      UpdateConditionFailError
    );
    identStore["checkCollectionUpdateCondition"](ident, "plops", undefined, 0, null);

    assert.rejects(
      () => identStore["simulateUpsertItemToCollection"](undefined, undefined, <any>"__proto__", undefined, new Date()),
      /Cannot update __proto__: js\/prototype-polluting-assignment/
    );
  }

  @test
  async configuration() {
    const identStore: FileStore = this.identStore;
    assert.strictEqual(
      identStore.canTriggerConfiguration("plop", () => {}),
      false
    );
    assert.strictEqual(await identStore.getConfiguration("plop"), undefined);
    await IdentTest["Store"].create("plop", { plop: 1, other: true });
    assert.deepStrictEqual(await identStore.getConfiguration("plop"), {
      other: true,
      plop: 1
    });
  }

  @test
  async cacheMishit() {
    const identStore: FileStore = this.identStore;
    const ident: CoreModel = await IdentTest["Store"].create("test", {});
    await identStore._cacheStore.__clean();
    // @ts-ignore
    await ident.patch({ retest: true });
  }

  @test
  computeParams() {
    const usersStore: FileStore<any> = this.userStore;
    removeSync(usersStore.getParameters().folder);
    usersStore.computeParameters();
    assert.ok(existsSync(usersStore.getParameters().folder));
  }

  @test
  async strictModeRejectsForeignType() {
    const tmpFolder = join(tmpdir(), `webda-fs-strict-reject-${Date.now()}`);
    mkdirSync(tmpFolder);
    try {
      const store: FileStore<any> = await this.addService(
        FileStore,
        { folder: tmpFolder, models: ["Webda/Ident"], strict: true },
        "StrictRejectStore"
      );
      // Write a file directly with a __type that is NOT the configured model.
      const uid = "strict-reject-test-uid";
      writeFileSync(join(tmpFolder, `${uid}.json`), JSON.stringify({ __type: "Webda/User", uuid: uid }));
      // _get should return undefined because Webda/User is not at depth 0 in _modelsHierarchy
      const result = await store["_get"](uid, false);
      assert.strictEqual(result, undefined, "strict mode should reject a file whose __type is not the configured model");
    } finally {
      rmSync(tmpFolder, { recursive: true, force: true });
    }
  }

  @test
  async strictModeAcceptsConfiguredType() {
    const tmpFolder = join(tmpdir(), `webda-fs-strict-accept-${Date.now()}`);
    mkdirSync(tmpFolder);
    try {
      const store: FileStore<any> = await this.addService(
        FileStore,
        { folder: tmpFolder, models: ["Webda/Ident"], strict: true },
        "StrictAcceptStore"
      );
      // Write a file directly with the matching __type.
      const uid = "strict-accept-test-uid";
      writeFileSync(join(tmpFolder, `${uid}.json`), JSON.stringify({ __type: "Webda/Ident", uuid: uid }));
      // _get should return the data because Webda/Ident is at depth 0 in _modelsHierarchy
      const result = await store["_get"](uid, false);
      assert.ok(result !== undefined, "strict mode should accept a file whose __type matches the configured model");
      assert.strictEqual(result.__type, "Webda/Ident");
    } finally {
      rmSync(tmpFolder, { recursive: true, force: true });
    }
  }
}

export { FileStoreTest };
