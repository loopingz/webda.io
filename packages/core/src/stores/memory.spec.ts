import { suite, test, consumeAsyncIterator } from "@webda/test";
import * as assert from "assert";
import { existsSync } from "fs";
import sinon from "sinon";
import {
  Application,
  Ident,
  MemoryStore,
  MemoryWithQueryRepository,
  runWithContext,
  useApplication,
  useModel,
  User
} from "../index.js";
import { FileUtils } from "@webda/utils";
import { StoreNotFoundError } from "./store.js";
import { PermissionModel, StoreTest } from "./store.spec.js";
import * as WebdaQL from "@webda/ql";
import { WebdaApplicationTest } from "../test/application.js";
import { Model, ModelClass, SelfJSONed, UuidModel, WEBDA_PRIMARY_KEY } from "@webda/models";

/**
 * Fake User for migration test
 */
class DemoUser extends User {}

@suite
class MemoryStoreTest extends StoreTest<MemoryStore> {
  async beforeEach() {
    this.cleanFiles.push(".test.json");
    return super.beforeEach();
  }

  async getIdentStore(): Promise<MemoryStore<any>> {
    const identStore = new MemoryStore("Idents", { model: "WebdaTest/Ident" });
    // @ts-ignore
    const original = identStore._get.bind(identStore);
    // @ts-ignore
    identStore._get = async (...args) => {
      await this.sleep(1);
      return original(...args);
    };
    return await identStore.resolve().init();
  }

  async getUserStore(): Promise<MemoryStore<any>> {
    return this.addService(MemoryStore, { model: "Webda/User" }, "Users");
  }

  @test
  async queryAdditional() {
    const User = await this.fillForQuery();
    const userStore = User.store();
    // Verify permission issue and half pagination
    userStore.setModel(PermissionModel);
    userStore.getParameters().forceModel = true;
    // Return undefined as filter to trigger the warning
    const find = userStore.find;
    userStore.find = async query => {
      const res = await find.bind(userStore)({
        filter: new WebdaQL.AndExpression([]),
        continuationToken: query.continuationToken,
        limit: query.limit
      });
      return {
        ...res,
        filter: undefined
      };
    };
    const context = await this.newContext();
    // Verify pagination system
    let res, offset;
    let total = 0;
    await runWithContext(context, async () => {
      do {
        res = await userStore.query(`state = 'CA' LIMIT 10 ${offset ? 'OFFSET "' + offset + '"' : ""}`);
        offset = res.continuationToken;
        total += res.results.length;
      } while (offset);
      assert.strictEqual(total, 100);

      assert.rejects(
        () => consumeAsyncIterator(userStore.iterate("state = 'CA' OFFSET 123")),
        /Cannot contain an OFFSET for queryAll method/
      );
    });
    // Run as system
    assert.strictEqual((await consumeAsyncIterator(userStore.iterate("state = 'CA' LIMIT 50"))).length, 250);
    return userStore;
  }

  @test
  getSync() {
    assert.throws(() => this.identStore._getSync("plop", true), StoreNotFoundError);
  }

  @test
  async persistence() {
    this.cleanFiles.push(".test.json.gz");

    const identStore = this.identStore;
    identStore.getParameters().persistence = {
      path: ".test.json.gz",
      delay: 10,
      compressionLevel: 9
    };
    await identStore.init();
    // @ts-ignore
    await identStore.put("test", { label: "\n\n" });
    await this.sleep(20);
    await identStore.persistencePromise;
    // Check basic persistence
    assert.ok(existsSync(".test.json.gz"));
    //assert.notStrictEqual(FileUtils.load(".test.json.gz").test, undefined);
    identStore.storage = {};
    // Check basic load of persistence
    await identStore.init();
    assert.notStrictEqual(identStore.storage.test, undefined);
    identStore.storage = {};
    identStore.getParameters().persistence = {
      path: ".test.json"
    };
    // Test old format non-encrypted and non-compressed
    FileUtils.save({ uuid: "test", test: "ok" }, ".test.json");
    await identStore.init();
    assert.notStrictEqual(identStore.storage.test, undefined);
    // Check encryption
    identStore.getParameters().persistence = {
      path: ".test.json",
      delay: 0,
      key: "test",
      cipher: "aes-256-ctr"
    };
    // Should silently ignore not encrypted file
    await identStore.init();
    await identStore.create("test", {});
    await identStore.persist();
    identStore.storage = {};
    // Check basic load of persistence
    await identStore.init();
    assert.notStrictEqual(identStore.storage.test, undefined);

    const mock = sinon.stub(identStore, "persist").returns(Promise.resolve());
    await identStore.stop();
    assert.strictEqual(mock.callCount, 1);
  }
}

@suite
class AdditionalMemoryTest extends WebdaApplicationTest {
  @test
  async multiModelQuery() {
    const Teacher = useModel<Model & { name: string }>("Teacher");
    const Project = useModel<Model & { name: string }>("Project");
    const SubProject = useModel<Model & { name: string }>("SubProject");
    const AnotherSubProject = useModel<Model & { name: string }>("AnotherSubProject");
    const SubSubProject = useModel<Model & { name: string }>("SubSubProject");

    await Promise.all(
      [Teacher, Project, SubProject, AnotherSubProject, SubSubProject].map(model => {
        const p: Promise<any>[] = [];
        for (let i = 1; i < 4; i++) {
          p.push(model.create({ name: `${model.name} ${i}` }));
        }
        return Promise.all(p);
      })
    );
    assert.strictEqual((await Teacher.query("")).results.length, 3);
    assert.strictEqual((await Teacher.query("", false)).results.length, 3);
    assert.strictEqual((await Project.query("")).results.length, 12);
    assert.strictEqual((await Project.query("", false)).results.length, 3);
    assert.strictEqual((await AnotherSubProject.query("")).results.length, 6);
    assert.strictEqual((await AnotherSubProject.query("", false)).results.length, 3);
    assert.strictEqual((await SubProject.query("")).results.length, 3);
    assert.strictEqual((await SubProject.query("", false)).results.length, 3);
  }

  @test
  async additionalModels() {
    const subProject = useModel("WebdaDemo/SubProject");
    const project = useModel("WebdaDemo/Project");
    let store = new MemoryStore("additionalModel", { model: "WebdaDemo/SubProject" }).resolve();
    assert.strictEqual(store.handleModel(project), -1);
    assert.strictEqual(store.handleModel(subProject), 0);
    assert.strictEqual(store.handleModel(useModel("WebdaDemo/AnotherSubProject")), -1);
    store = new MemoryStore("additionalModel", {
      model: "WebdaDemo/SubProject",
      additionalModels: ["WebdaDemo/Project"]
    }).resolve();
    assert.strictEqual(store.handleModel(project), 0);
    assert.strictEqual(store.handleModel(subProject), 0);
    assert.strictEqual(store.handleModel(useModel("WebdaDemo/AnotherSubProject")), 1);
    assert.strictEqual(store.handleModel(useModel("WebdaDemo/SubSubProject")), 2);
    store = new MemoryStore("additionalModel", {
      model: "WebdaDemo/SubProject",
      additionalModels: ["WebdaDemo/Project"],
      strict: true
    }).resolve();
    assert.strictEqual(store.handleModel(project), -1);
    assert.strictEqual(store.handleModel(subProject), 0);
    assert.strictEqual(store.handleModel(useModel("WebdaDemo/AnotherSubProject")), -1);
  }

  @test
  async multiModel() {
    const identStore: MemoryStore = await this.addService(
      MemoryStore,
      { model: "Webda/Ident", strict: false },
      "Idents"
    );
    await identStore.create("user", new User().setUuid("user"));
    await identStore.create("ident", new Ident().load({ uuid: "ident" }, true));
    assert.ok((await identStore.get("user")) instanceof User);
    assert.ok((await identStore.get("ident")) instanceof Ident);
    identStore.getParameters().defaultModel = true;
    identStore.storage["user"] = identStore.storage["user"].replace(/User/, "User2");
    assert.strictEqual((await identStore.get("user")).constructor.name, "Ident");
    assert.ok((await identStore.get("ident")) instanceof Ident);
    identStore.getParameters().defaultModel = false;
    assert.ok((await identStore.get("user")) === undefined);
    assert.ok((await identStore.get("ident")) instanceof Ident);
  }

  @test
  async migration() {
    (<Application>useApplication()).addModel("Webda/User", User);
    (<Application>useApplication()).addModel("WebdaDemo/User", DemoUser);
    const usersStore: MemoryStore<any> = await this.addService(MemoryStore, { model: "Webda/User" });
    for (let i = 0; i < 1200; i++) {
      await usersStore.create(`id_${i}`, { id: i });
      if (i % 10 === 0) {
        usersStore.storage[`id_${i}`] = usersStore.storage[`id_${i}`].replace(/Webda\/User/, "webda/user2");
      } else if (i % 2 === 0) {
        usersStore.storage[`id_${i}`] = usersStore.storage[`id_${i}`].replace(/Webda\/User/, "User");
      }
    }
    usersStore.getParameters().modelAliases = {
      "webda/user2": "WebdaDemo/User"
    };
    await usersStore.cleanModelAliases();
    (await usersStore.getAll()).forEach(user => {
      if (user.id % 10 === 0) {
        assert.strictEqual(user.__type, "WebdaDemo/User");
      } else if (user.id % 2 === 0) {
        assert.strictEqual(user.__type, "User");
      } else {
        assert.strictEqual(user.__type, "Webda/User");
      }
    });
    await usersStore.recomputeTypeLongId();
    (await usersStore.getAll()).forEach(user => {
      if (user.id % 10 === 0) {
        assert.strictEqual(user.__type, "WebdaDemo/User");
      } else if (user.id % 2 === 0) {
        assert.strictEqual(user.__type, "WebdaDemo/User");
      } else {
        assert.strictEqual(user.__type, "Webda/User");
      }
    });
    await usersStore.getMigration(`storeMigration.${usersStore.getName()}.typesShortId`);
    await usersStore.cancelMigration(`storeMigration.${usersStore.getName()}.typesShortId`);

    await usersStore.migration("test", async () => {
      return async () => {};
    });
  }

  getTestConfiguration() {
    return "../../sample-app/webda.config.jsonc";
  }
}

export { MemoryStoreTest };
