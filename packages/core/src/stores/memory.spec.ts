import { PermissionModel, StoreTest } from "./store.spec";
import { CoreModel, Store, MemoryStore, AggregatorService } from "../index";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { HttpContext } from "../utils/context";
import { StoreNotFoundError } from "./store";
import { WebdaQL } from "./webdaql/query";

@suite
class MemoryStoreTest extends StoreTest {
  getIdentStore(): Store<any> {
    // Need to slow down the _get
    let store = <Store<any>>this.getService("MemoryIdents");
    let original = store._get.bind(store);
    store._get = async (...args) => {
      await this.sleep(1);
      return original(...args);
    };
    return store;
  }

  getUserStore(): Store<any> {
    return <Store<any>>this.getService("MemoryUsers");
  }

  async getIndex(): Promise<CoreModel> {
    return this.getService<Store>("memoryaggregators").get("index");
  }

  async recreateIndex() {
    let store = this.getService<Store>("memoryaggregators");
    await store.__clean();
    await this.getService<AggregatorService>("memoryidentsindexer").createAggregate();
  }

  @test async deleteAsyncHttp() {
    let executor, ctx;
    ctx = await this.webda.newContext(new HttpContext("test.webda.io", "GET", "/memory/idents/ToDelete"));
    let identStore: MemoryStore<CoreModel> = <MemoryStore<CoreModel>>this.getIdentStore();
    await identStore.save({
      uuid: "toDelete",
      test: "ok"
    });
    await identStore.delete("toDelete");
    executor = this.getExecutor(ctx, "test.webda.io", "GET", "/memory/idents/toDelete");
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(
      () => executor.execute(ctx),
      err => err == 404
    );
    executor = this.getExecutor(ctx, "test.webda.io", "PUT", "/memory/idents/toDelete");
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(
      () => executor.execute(ctx),
      err => err == 404
    );
    executor = this.getExecutor(ctx, "test.webda.io", "DELETE", "/memory/idents/toDelete");
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(
      () => executor.execute(ctx),
      err => err == 404
    );
    assert.strictEqual(identStore._getSync("notFound"), null);
  }

  @test
  async queryAdditional() {
    let userStore = await this.fillForQuery();
    // Verify permission issue and half pagination
    userStore.setModel(PermissionModel);
    // Return undefined as filter to trigger the warning
    let find = userStore.find;
    userStore.find = async (_, offset, limit) => {
      let res = await find.bind(userStore)(new WebdaQL.AndExpression([]), offset, limit);
      return {
        ...res,
        filter: undefined
      };
    };
    let context = await this.newContext();
    // Verify pagination system
    let res, offset;
    let total = 0;
    do {
      res = await userStore.query(`state = 'CA' LIMIT 100 ${offset ? 'OFFSET "' + offset + '"' : ""}`, context);
      offset = res.continuationToken;
      total += res.results.length;
    } while (offset);
    assert.strictEqual(total, 100);
    return userStore;
  }

  @test
  initRoutes() {
    // cov
    let identStore: MemoryStore<CoreModel> = <MemoryStore<CoreModel>>this.getIdentStore();
    identStore.getParameters().expose = undefined;
    identStore.initRoutes();
  }

  @test
  getSync() {
    let identStore: MemoryStore<CoreModel> = <MemoryStore<CoreModel>>this.getIdentStore();
    assert.throws(() => identStore._getSync("plop", true), StoreNotFoundError);
  }

  @test
  async badActions() {
    let identStore: MemoryStore<CoreModel> = <MemoryStore<CoreModel>>this.getIdentStore();
    // @ts-ignore
    identStore._model = {
      getActions: () => {
        return { test: { global: true } };
      }
    };
    await assert.throws(() => identStore.initRoutes(), /Action static method _test does not exist/);
    // @ts-ignore
    identStore._model = {
      // @ts-ignore
      prototype: {},
      getActions: () => {
        return { test: { global: false } };
      }
    };
    await assert.throws(() => identStore.initRoutes(), /Action method _test does not exist/);
  }
}

export { MemoryStoreTest };
