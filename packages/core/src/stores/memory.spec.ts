import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { existsSync, unlinkSync } from "fs";
import { AggregatorService, CoreModel, Ident, MemoryStore, Store, User, WebdaError } from "../index";
import { HttpContext } from "../utils/httpcontext";
import { JSONUtils } from "../utils/serializers";
import { StoreNotFoundError } from "./store";
import { PermissionModel, StoreTest } from "./store.spec";
import { WebdaQL } from "./webdaql/query";

@suite
class MemoryStoreTest extends StoreTest {
  async before() {
    this.cleanFiles.push(".test.json");
    return super.before();
  }

  getIdentStore(): Store<any> {
    // Need to slow down the _get
    let store = <Store<any>>this.getService("MemoryIdents");
    // @ts-ignore
    let original = store._get.bind(store);
    // @ts-ignore
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
    return this.getService<Store>("MemoryAggregators").get("index");
  }

  async recreateIndex() {
    let store = this.getService<Store>("MemoryAggregators");
    await store.__clean();
    await this.getService<AggregatorService>("MemoryIdentsIndexer").createAggregate();
  }

  @test async deleteAsyncHttp() {
    let executor, ctx;
    ctx = await this.webda.newWebContext(new HttpContext("test.webda.io", "GET", "/memory/idents/ToDelete"));
    let identStore: MemoryStore<CoreModel> = <MemoryStore<CoreModel>>this.getIdentStore();
    await identStore.save({
      uuid: "toDelete",
      test: "ok"
    });
    await identStore.delete("toDelete");
    executor = this.getExecutor(ctx, "test.webda.io", "GET", "/memory/idents/toDelete");
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(() => executor.execute(ctx), WebdaError.NotFound);
    executor = this.getExecutor(ctx, "test.webda.io", "PUT", "/memory/idents/toDelete");
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(() => executor.execute(ctx), WebdaError.NotFound);
    executor = this.getExecutor(ctx, "test.webda.io", "DELETE", "/memory/idents/toDelete");
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(() => executor.execute(ctx), WebdaError.NotFound);
    assert.strictEqual(identStore._getSync("notFound"), null);
  }

  @test
  async queryAdditional() {
    let userStore = await this.fillForQuery();
    // Verify permission issue and half pagination
    userStore.setModel(PermissionModel);
    userStore.getParameters().forceModel = true;
    // Return undefined as filter to trigger the warning
    let find = userStore.find;
    userStore.find = async query => {
      let res = await find.bind(userStore)({
        filter: new WebdaQL.AndExpression([]),
        continuationToken: query.continuationToken,
        limit: query.limit
      });
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
    assert.rejects(() => userStore.queryAll("state = 'CA' OFFSET 123"), /Cannot contain an OFFSET for queryAll method/);
    assert.strictEqual((await userStore.queryAll("state = 'CA' LIMIT 50")).length, 250);
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
    await assert.throws(() => identStore.initRoutes(), /Action static method \/_\?test\/ does not exist/);
    // @ts-ignore
    identStore._model = {
      // @ts-ignore
      prototype: {},
      getActions: () => {
        return { test: { global: false } };
      }
    };
    await assert.throws(() => identStore.initRoutes(), /Action method \/_\?test\/ does not exist/);
  }

  @test
  async multiModel() {
    let identStore: MemoryStore<CoreModel> = <MemoryStore<CoreModel>>this.getIdentStore();
    identStore.getParameters().strict = false;
    await identStore.save(new User().setUuid("user"));
    await identStore.save(new Ident().load({ uuid: "ident" }, true));
    assert.ok((await identStore.get("user")) instanceof User);
    assert.ok((await identStore.get("ident")) instanceof Ident);
    identStore.getParameters().defaultModel = true;
    identStore.storage["user"] = identStore.storage["user"].replace(/User/, "User2");
    assert.ok((await identStore.get("user")).constructor.name === "Ident");
    assert.ok((await identStore.get("ident")) instanceof Ident);
    identStore.getParameters().defaultModel = false;
    await assert.rejects(() => identStore.get("user"));
    assert.ok((await identStore.get("ident")) instanceof Ident);
  }

  @test
  async migration() {
    let usersStore: MemoryStore<any> = <MemoryStore<any>>this.getUserStore();
    for (let i = 0; i < 1200; i++) {
      await usersStore.save({ uuid: `id_${i}`, id: i });
      if (i % 10 === 0) {
        usersStore.storage[`id_${i}`] = usersStore.storage[`id_${i}`].replace(/User/, "webda/user2");
      } else if (i % 2 === 0) {
        usersStore.storage[`id_${i}`] = usersStore.storage[`id_${i}`].replace(/User/, "webda/user");
      }
    }
    await usersStore.v3Migration();
    (await usersStore.getAll()).forEach(user => {
      if (user.id % 10 === 0) {
        assert.strictEqual(user.__type, "webda/user2");
      } else if (user.id % 2 === 0) {
        assert.strictEqual(user.__type, "User");
      } else {
        assert.strictEqual(user.__type, "User");
      }
    });
  }

  @test
  async persistence() {
    // Remove the path if exists
    if (existsSync(".test.json")) {
      unlinkSync(".test.json");
    }
    let identStore: MemoryStore<CoreModel> = <MemoryStore<CoreModel>>this.getIdentStore();
    identStore.getParameters().persistence = {
      path: ".test.json",
      delay: 10
    };
    await identStore.init();
    await identStore.put("test", {});
    await this.sleep(10);
    // Check basic persistence
    assert.ok(existsSync(".test.json"));
    assert.notStrictEqual(JSONUtils.loadFile(".test.json").test, undefined);
    identStore.storage = {};
    // Check basic load of persistence
    await identStore.init();
    assert.notStrictEqual(identStore.storage.test, undefined);

    // Check encryption
    identStore.getParameters().persistence = {
      path: ".test.json",
      delay: 10,
      key: "test",
      cipher: "aes-256-ctr"
    };
    // Should silently ignore not encrypted file
    await identStore.init();
    await identStore.put("test", {});
    await this.sleep(10);
    identStore.storage = {};
    // Check basic load of persistence
    await identStore.init();
    assert.notStrictEqual(identStore.storage.test, undefined);
  }
}

export { MemoryStoreTest };
