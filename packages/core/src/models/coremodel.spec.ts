import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as sinon from "sinon";
import {
  Action,
  Context,
  Core,
  CoreModel,
  Expose,
  GlobalContext,
  MemoryStore,
  ModelLink,
  ModelLinksArray,
  ModelLinksMap,
  ModelLinksSimpleArray,
  ModelParent,
  ModelRelated,
  ModelsMapped,
  OperationContext,
  WebdaError,
  createModelLinksMap,
  getAttributeLevelProxy,
  runWithContext,
  useConfiguration
} from "../index";
import { Task } from "../test/objects";
import { WebdaApplicationTest } from "../test/test";
import { Constructor } from "@webda/tsc-esm";

@Expose()
class TestMask extends CoreModel {
  card: string;
  link: ModelLink<Task>;
  links: ModelLinksArray<Task, { card: string }>;
  links_simple: ModelLinksSimpleArray<Task>;
  links_map: ModelLinksMap<Task, { card: string }>;
  maps: ModelsMapped<Task, "_user", "uuid">;
  queries: ModelRelated<Task, "side">;
  parent: ModelParent<Task>;
  side: string;
  counter: number;

  hasAttributePermissions(mode: "READ" | "WRITE"): boolean {
    return true;
  }

  static getProxy<T extends CoreModel>(this: Constructor<T>, object: T): T {
    return getAttributeLevelProxy(object);
  }

  attributePermission(key: string, value: any, mode: "READ" | "WRITE", context?: OperationContext): any {
    if (key === "card") {
      if (mode === "WRITE") {
        const mask = "---X-XXXX-XXXX-X---";
        value = value.padEnd(mask.length, "?");
        for (let i = 0; i < mask.length; i++) {
          if (mask[i] === "X") {
            value = value.substring(0, i) + "X" + value.substring(i + 1);
          }
        }
        return value;
      } else if (!(context instanceof GlobalContext) && this.context.getCurrentUserId() !== "admin") {
        return undefined;
      }
    }
    return super.attributePermission(key, value, mode);
  }

  @Action({ name: "globalAction" })
  static globalActionMethod() {}

  @Action()
  localAction() {}
}

class SubTestMask extends TestMask {
  @Action()
  secondAction() {}

  @Action({ name: "localAction" })
  localActionMethod(): void {}
}

@suite
class CoreModelTest extends WebdaApplicationTest {
  @test
  async contextPermission() {
    // Object within a system context
    const test = await TestMask.create({});

    test.card = "1234-1234-1234-1234";
    assert.strictEqual(test.card, "123X-XXXX-XXXX-X234");
    const userContext = await this.newContext();
    let userObject;
    userContext.getSession().login("user", "none");

    // Context user with object attached
    await runWithContext(userContext, async () => {
      assert.strictEqual(test.card, undefined);
      userObject = await TestMask.create({ card: "1234-1234-1234-1234" });
      assert.strictEqual(userObject.card, undefined);
    }, [test]);

    // Context user but object is not attached
    runWithContext(userContext, () => {
      assert.strictEqual(test.card, "123X-XXXX-XXXX-X234");
      assert.strictEqual(userObject.card, undefined);
    });

    // Context admin
    const adminContext = await this.newContext();
    adminContext.getSession().login("admin", "none");
    runWithContext(adminContext, () => {
      assert.strictEqual(test.card, "123X-XXXX-XXXX-X234");
      assert.strictEqual(userObject.card, undefined);
    }, [test]);
    runWithContext(adminContext, () => {
      assert.strictEqual(test.card, "123X-XXXX-XXXX-X234");
      assert.strictEqual(userObject.card, "123X-XXXX-XXXX-X234");
    }, [test, userObject]);
  }

  @test("Verify unsecure loaded") unsecureLoad() {
    runWithContext(new OperationContext(), () => {
      const object: any = new CoreModel();
      object.load({
        _test: "plop",
        test: "plop"
      });
      assert.strictEqual(object._test, undefined);
      assert.strictEqual(object.test, "plop");
    });
  }

  @test
  maskAttribute() {
    const test = new TestMask()["load"]({ card: "1234-1245-5667-0124" });
    assert.strictEqual(test.card, "123X-XXXX-XXXX-X124");
  }

  @test
  actionAnnotation() {
    assert.deepStrictEqual(CoreModel.getActions(), {});
    assert.deepStrictEqual(TestMask.getActions(), {
      localAction: { global: false, method: "localAction" },
      globalAction: { global: true, method: "globalActionMethod", name: "globalAction" }
    });
    assert.deepStrictEqual(SubTestMask.getActions(), {
      secondAction: { global: false, method: "secondAction" },
      localAction: { global: false, method: "localActionMethod", name: "localAction" },
      globalAction: { global: true, method: "globalActionMethod", name: "globalAction" }
    });
  }

  @test
  unflat() {
    let counters = new CoreModel()
      ["load"](<any>{
        "test#second#bytes": 12,
        "test#second#size": 66,
        "test#first#bytes": 1,
        "test#first#size": 2
      })
      .unflat<any>();
    assert.deepStrictEqual(counters.test, {
      first: {
        bytes: 1,
        size: 2
      },
      second: {
        bytes: 12,
        size: 66
      }
    });
    const flat = {};
    CoreModel.flat(flat, counters.test);
    assert.deepStrictEqual(flat, {
      "second#bytes": 12,
      "second#size": 66,
      "first#bytes": 1,
      "first#size": 2
    });
    counters = new CoreModel()
      ["load"](<any>{
        "test|second|bytes": 12,
        "test|second|size": 66,
        "test|first|bytes": 1,
        "test|first|size": 2
      })
      .unflat<any>("|");
    assert.deepStrictEqual(counters.test, {
      first: {
        bytes: 1,
        size: 2
      },
      second: {
        bytes: 12,
        size: 66
      }
    });
  }

  @test("Verify secure constructor") secureConstructor() {
    const object: any = new CoreModel();
    object.load({
      _test: "plop",
      test: "plop",
      __serverOnly: "server"
    });
    assert.strictEqual(object.__serverOnly, "server");
    assert.strictEqual(object._test, "plop");
    assert.strictEqual(object.test, "plop");
    return object;
  }

  @test("Verify JSON export") jsonExport() {
    const object = this.secureConstructor();
    runWithContext(
      new OperationContext(),
      () => {
        const exported = JSON.parse(JSON.stringify(object));
        assert.strictEqual(exported.__serverOnly, undefined);
        assert.strictEqual(exported._test, "plop");
        assert.strictEqual(exported.test, "plop");
        assert.strictEqual(exported._gotContext, undefined);
      },
      [object]
    );
  }

  @test("Verify Context access within output to server") async withContext() {
    const ctx = await this.newContext();
    const task = new Task().load({ test: "plop", _gotContext: true });
    await runWithContext(ctx, () => {
      ctx.write(task);
      const result = JSON.parse(<string>ctx.getResponseBody());
      assert.strictEqual(result._gotContext, true);
    });
  }

  @test async cov() {
    const task = await Task.create({}, false);
    assert.ok(task instanceof CoreModel);
    await assert.rejects(
      () => new CoreModel().checkAct(undefined as any, "test"),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
    task.plop = 2;
    const store = {
      getService: this.webda.getService.bind(this.webda),
      delete: () => {},
      patch: () => {},
      get: async () => ({
        test: "123"
      })
    };
    task.__class.Store = <any>store;
    assert.strictEqual((await task.refresh()).test, "123");
    assert.notStrictEqual(task.generateUid(), undefined);
    const stub = sinon.stub(Task, "getUuidField").callsFake(() => "bouzouf");
    const deleteSpy = sinon.spy(store, "delete");
    const updateSpy = sinon.stub(store, "patch").callsFake(() => ({ plop: "bouzouf" }));
    try {
      task.setUuid("test");
      assert.strictEqual(task.getUuid(), "test");
      assert.strictEqual(task.bouzouf, "test");
      await task.delete();
      assert.strictEqual(deleteSpy.callCount, 1);
      task.plop = "bouzouf";
      assert.ok(task.isDirty());
      await task.save();
      assert.ok(!task.isDirty());
      assert.strictEqual(updateSpy.callCount, 1);
      assert.strictEqual(task.plop, "bouzouf");
    } finally {
      stub.restore();
      deleteSpy.restore();
    }
    // @ts-ignore
    process.webda = Core.singleton = undefined;
    // No test
    Task.getSchema();
  }

  @test
  async expose() {
    this.webda.getApplication().addModel("webdatest", TestMask);
  }

  @test async ref() {
    this.webda.getApplication().addModel("webdatest", TestMask);
    await this.addService<MemoryStore>(MemoryStore, { forceModel: false, model: "webdatest" }, "MemoryUsers");
    useConfiguration().parameters!["defaultStore"] = "MemoryUsers";
    assert.strictEqual(await TestMask.ref("unit1").exists(), false);
    console.log("LOAD OR CREATE");
    // @ts-ignore
    const task = await TestMask.ref("unit1").getOrCreate({ test: false });
    await task.refresh();
    console.log(task.__type, task.__types);
    assert.strictEqual(await TestMask.ref("unit1").exists(), true);
    await TestMask.ref("unit1").incrementAttributes([{ property: "counter", value: 1 }]);
    await TestMask.ref("unit1").setAttribute("side", "plop");
    await task.refresh();
    assert.strictEqual(task.counter, 1);
    assert.strictEqual(task.side, "plop");
    await TestMask.ref("unit1").removeAttribute("side");
    await TestMask.ref("unit1").patch({ counter: 2 }, null, undefined);
    await task.refresh();
    assert.strictEqual(task.counter, 2);
    assert.strictEqual(task.side, undefined);
    await TestMask.ref("unit1").patch({ counter: 3 });
    await TestMask.ref("unit1").upsertItemToCollection("__types", "plop");
    await task.refresh();
    assert.strictEqual(task.counter, 3);
    console.log(task);
    assert.deepStrictEqual(task.__types, ["webdatest", "plop"]);
    await TestMask.ref("unit1").deleteItemFromCollection("__types", 1, null);
    await task.refresh();
    assert.deepStrictEqual(task.__types, ["webdatest"]);
    // Relations test
    const link = new ModelLink("unit1", TestMask);
    // @ts-ignore
    assert.strictEqual((await link.get()).counter, 3);
    assert.strictEqual(link.getUuid(), "unit1");
    assert.strictEqual(link.toString(), "unit1");
    const customLink = createModelLinksMap(TestMask, { test: { uuid: "test", label: "test" } });
    // @ts-ignore
    assert.strictEqual(customLink.test.label, "test");

    await TestMask.ref("unit1").delete();
    assert.strictEqual(await TestMask.ref("unit1").exists(), false);
    assert.strictEqual(TestMask.ref("unit1").getUuid(), "unit1");
  }

  @test async fullUuid() {
    await this.addService(MemoryStore, {}, "MemoryUsers");
    useConfiguration().parameters!["defaultStore"] = "MemoryUsers";
    assert.strictEqual(new Task().__type, "Task");
    const task = await Task.ref("task#1").getOrCreate({ test: false });
    assert.strictEqual(task.getFullUuid(), "Task$task#1");
    let taskB = await this.webda.getModelObject("Task$task#1");
    // @ts-ignore
    assert.strictEqual(taskB.test, false);
    taskB = await this.webda.getModelObject(task.getFullUuid(), { test: true });
    // @ts-ignore
    assert.strictEqual(taskB.test, true);
  }

  @test async refresh() {
    const task = new Task();
    task.__class.Store.get = async () => undefined as any;
    await task.refresh();
    task.__class.Store.get = async () => <any>{ plop: "bouzouf" };
    await task.refresh();
    assert.strictEqual(task.plop, "bouzouf");
  }

  @test
  async loaders() {
    this.webda.getApplication().getRelations = () => {
      return {
        parent: {
          model: "webdatest/testmask",
          attribute: "parent"
        },
        links: [
          {
            model: "webdatest/testmask",
            attribute: "link",
            type: "LINK"
          },
          {
            model: "webdatest/testmask",
            attribute: "links",
            type: "LINKS_ARRAY"
          },
          {
            model: "webdatest/testmask",
            attribute: "links_simple",
            type: "LINKS_SIMPLE_ARRAY"
          },
          {
            model: "webdatest/testmask",
            attribute: "links_map",
            type: "LINKS_MAP"
          }
        ],
        maps: [
          {
            model: "webdatest/testmask",
            attribute: "maps",
            targetAttributes: [],
            targetLink: "",
            cascadeDelete: false
          }
        ],
        queries: [
          {
            model: "webdatest/testmask",
            attribute: "queries",
            targetAttribute: "side"
          }
        ]
      };
    };
    this.webda.getApplication().getModels()["webdatest/testmask"] = TestMask;
    const test = new TestMask().load({ card: "1234-1245-5667-0124", maps: [{ uuid: "uuid-test" }] }, true);
    await new TestMask().load({ side: "uuid-test" }).save();
    const mask2 = await new TestMask().load({ side: "uuid-test", card: "2234-1245-5667-0124" }).save();
    assert.strictEqual(mask2.__type, "webdatest/testmask");
    test.setUuid("uuid-test");
    test.parent.set("uuid-test");
    await test.save();
    test.links.add({ card: "test", uuid: test.getUuid() });
    test.links.remove(test.getUuid());
    test.links_simple.add(test.getUuid());
    assert.strictEqual(test.links_simple.length, 1);
    test.links_simple.remove(test.getUuid());
    test.links_simple.add(test.getUuid());
    test.links_map.add(test);
    test.links_map.remove(test);
    assert.strictEqual((await test.links_simple[0].get()).card, "123X-XXXX-XXXX-X124");
    assert.strictEqual((await test.parent.get()).card, "123X-XXXX-XXXX-X124");
    assert.strictEqual((await test.maps[0].get()).card, "123X-XXXX-XXXX-X124");
    let info: any[] = await test.queries.getAll();
    console.log(info, await mask2.refresh());
    assert.strictEqual(info.length, 2);
    assert.strictEqual((await test.queries.query("card = '223X-XXXX-XXXX-X124'")).results.length, 1);
    let count = 0;
    // @ts-ignore
    await test.queries.forEach(async () => {
      count++;
    });
    assert.strictEqual(count, 2);
    info = [];
    for await (const item of TestMask.iterate('side="uuid-test"')) {
      info.push(item);
    }
    assert.strictEqual(count, 2);
    await test.setAttribute("side", "uuid-test2");
    await test.incrementAttribute("counter", 1);
    const test2 = await TestMask.ref(test.getUuid()).get();
    assert.strictEqual(test2.counter, test.counter);
    assert.strictEqual(test2.side, "uuid-test2");
    assert.strictEqual(test2.counter, 1);
    await test.removeAttribute("counter");
    await test2.refresh();
    assert.strictEqual(test.counter, undefined);
    assert.strictEqual(test2.counter, undefined);
  }
}
