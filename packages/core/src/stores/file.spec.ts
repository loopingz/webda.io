import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync } from "fs";
import pkg from "fs-extra";
import * as sinon from "sinon";
import { CoreModel, FileStore, ModelMapLoaderImplementation, Store } from "../index";
import { User } from "../models/user";
import { StoreNotFoundError, UpdateConditionFailError } from "./store";
import { IdentTest, StoreTest, UserTest } from "./store.spec";
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
    const identStore = new FileStore(this.webda, "Idents", {
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
      user.idents.push(new ModelMapLoaderImplementation(identStore._model, { uuid: ident.getUuid() }, user));
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
}

export { FileStoreTest };
