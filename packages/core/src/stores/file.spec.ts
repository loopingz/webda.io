import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { existsSync } from "fs";
import pkg from "fs-extra";
import * as sinon from "sinon";
import { CoreModel, FileStore, FileUtils, ModelMapLoaderImplementation, Store, WebdaError } from "../index";
import { User } from "../models/user";
import { HttpContext } from "../utils/httpcontext";
import { AggregatorService } from "./aggregator";
import { StoreNotFoundError, UpdateConditionFailError } from "./store";
import { StoreTest } from "./store.spec";
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
class FileStoreTest extends StoreTest {
  userStore: FileStore;
  identStore: FileStore;

  getUserStore(): Store<any> {
    this.userStore ??= new FileStore(this.webda, "Users", { folder: "./test/data/idents", model: "Webda/User" });
    return this.userStore;
  }

  getIdentStore(): Store<any> {
    // Need to slow down the _get
    if (!this.identStore) {
      this.identStore = new FileStore(this.webda, "Idents", {
        model: "WebdaTest/Ident",
        folder: "./test/data/idents"
      });
      // @ts-ignore
      const original = this.identStore._get.bind(this.identStore);
      // @ts-ignore
      this.identStore._get = async (...args) => {
        await this.sleep(1);
        return original(...args);
      };
    }
    return this.identStore;
  }

  @test
  async update(delay: number = 100) {
    // Increase the delay for FileStore
    return super.update(delay);
  }

  @test
  async cov() {
    const identStore: FileStore<CoreModel & { test: number; plops: any[] }> = this.getService<any>("Idents");
    const userStore: FileStore<CoreModel> = this.getService<FileStore<CoreModel>>("Users");
    const user: any = await userStore.save({});
    let ident = await identStore.save({
      _user: user.getUuid()
    });
    identStore.getParameters().strict = true;
    let res = await identStore.get(user.getUuid());
    assert.strictEqual(res, undefined);
    const stub = sinon.stub(identStore, "_get").callsFake(async () => user);
    try {
      res = await identStore.get(user.getUuid());
      assert.strictEqual(res, undefined);
      await assert.rejects(
        () =>
          identStore.update({
            uuid: user.getUuid(),
            plop: true
          }),
        StoreNotFoundError
      );
      await user.refresh();
      assert.strictEqual(user.plop, undefined);
      user.idents ??= [];
      user.idents.push(new ModelMapLoaderImplementation(identStore._model, { uuid: ident.getUuid() }, user));
      userStore["initModel"](user);
      await identStore.delete(user.getUuid());
    } finally {
      stub.restore();
    }

    identStore.incrementAttribute("test", "test", 12);
    await identStore.create({ uuid: "test_cache" });
    await identStore.get("test_cache");
    assert.notStrictEqual(await identStore["_cacheStore"].get("test_cache"), undefined);
    identStore.emitStoreEvent("Store.PartialUpdated", {
      object_id: "test_cache",
      partial_update: {},
      store: identStore
    });
    assert.strictEqual(await identStore["_cacheStore"].get("test"), undefined);
    // Shoud return directly
    await identStore.incrementAttribute("test", "test", 0);
    removeSync(identStore.getParameters().folder);
    // Should not fail
    await identStore.__clean();
    // Should recreate folder
    identStore.computeParameters();
    existsSync(identStore.getParameters().folder);

    ident = new identStore._model();
    identStore.newModel(ident);
    assert.notStrictEqual(ident.getUuid(), undefined);

    // Test guard-rails (seems hardly reachable so might be useless)
    assert.throws(
      () => identStore.checkCollectionUpdateCondition(ident, "plops", undefined, 1, null),
      UpdateConditionFailError
    );
    // @ts-ignore
    ident.plops = [];
    assert.throws(
      () => identStore.checkCollectionUpdateCondition(ident, "plops", undefined, 1, null),
      UpdateConditionFailError
    );
    identStore.checkCollectionUpdateCondition(ident, "plops", undefined, 0, null);

    assert.rejects(
      () => identStore.simulateUpsertItemToCollection(undefined, <any>"__proto__", undefined, new Date()),
      /Cannot update __proto__: js\/prototype-polluting-assignment/
    );
  }

  @test
  async configuration() {
    const identStore: FileStore<CoreModel> = this.getService<FileStore<CoreModel>>("Idents");
    assert.strictEqual(
      identStore.canTriggerConfiguration("plop", () => {}),
      false
    );
    assert.strictEqual(await identStore.getConfiguration("plop"), undefined);
    await identStore.save({ plop: 1, other: true, uuid: "plop" });
    assert.deepStrictEqual(await identStore.getConfiguration("plop"), {
      other: true,
      plop: 1
    });
  }

  @test
  async cacheMishit() {
    const identStore: FileStore<CoreModel> = this.getService<FileStore<CoreModel>>("Idents");
    const ident: CoreModel = await identStore.save({ uuid: "test" });
    await identStore._cacheStore.__clean();
    // @ts-ignore
    await ident.patch({ retest: true });
  }

  @test
  computeParams() {
    const usersStore: FileStore<any> = <FileStore<any>>this.getUserStore();
    removeSync(usersStore.getParameters().folder);
    usersStore.computeParameters();
    assert.ok(existsSync(usersStore.getParameters().folder));
  }
}

export { FileStoreTest };
