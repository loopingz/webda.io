import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as sinon from "sinon";
import {
  Action,
  Core,
  CoreModel,
  Expose,
  ModelLink,
  ModelLinksArray,
  ModelLinksMap,
  ModelLinksSimpleArray,
  ModelParent,
  ModelRelated,
  ModelsMapped,
  OperationContext,
  Store
} from "..";
import { Task } from "../../test/models/task";
import { WebdaTest } from "../test";

@Expose()
class TestMask extends CoreModel {
  card: string;
  link: ModelLink<Task>;
  links: ModelLinksArray<Task, { card: string }>;
  links_simple: ModelLinksSimpleArray<Task>;
  links_map: ModelLinksMap<Task, { card: string }>;
  maps: ModelsMapped<Task, "uuid">;
  queries: ModelRelated<Task, "side">;
  parent: ModelParent<Task>;
  side: string;
  counter: number;

  attributePermission(key: string, value: any, mode: "READ" | "WRITE", context?: OperationContext): any {
    if (key === "card") {
      const mask = "---X-XXXX-XXXX-X---";
      value = value.padEnd(mask.length, "?");
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] === "X") {
          value = value.substring(0, i) + "X" + value.substring(i + 1);
        }
      }
      return value;
    }
    return super.attributePermission(key, value, mode, context);
  }

  @Action()
  static globalAction() {}

  @Action()
  localAction() {}
}

class SubTestMask extends TestMask {
  @Action()
  secondAction() {}
}
@suite
class CoreModelTest extends WebdaTest {
  @test("Verify unsecure loaded") unsecureLoad() {
    let object: any = new CoreModel();
    object.load({
      _test: "plop",
      test: "plop"
    });
    assert.strictEqual(object._test, undefined);
    assert.strictEqual(object.test, "plop");
  }

  @test
  maskAttribute() {
    let test = new TestMask().load({ card: "1234-1245-5667-0124" });
    assert.strictEqual(test.card, "123X-XXXX-XXXX-X124");
  }

  @test
  actionAnnotation() {
    assert.deepStrictEqual(CoreModel.getActions(), {});
    assert.deepStrictEqual(TestMask.getActions(), {
      localAction: { global: false },
      globalAction: { global: true }
    });
    assert.deepStrictEqual(SubTestMask.getActions(), {
      secondAction: { global: false },
      localAction: { global: false },
      globalAction: { global: true }
    });
  }

  @test
  unflat() {
    let counters = new CoreModel()
      .load(<any>{
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
      .load(<any>{
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
    let object: any = new CoreModel();
    object.load(
      {
        _test: "plop",
        test: "plop",
        __serverOnly: "server"
      },
      true
    );
    assert.strictEqual(object._test, "plop");
    assert.strictEqual(object.test, "plop");
    return object;
  }

  @test("Verify JSON export") jsonExport() {
    let object = this.secureConstructor();
    let exported = JSON.parse(JSON.stringify(object));
    assert.strictEqual(exported.__serverOnly, undefined);
    assert.strictEqual(exported._test, "plop");
    assert.strictEqual(exported.test, "plop");
    assert.strictEqual(exported._gotContext, undefined);
  }

  @test("Verify JSON stored export") jsonStoredExport() {
    let object = this.secureConstructor();
    let exported = object.toStoredJSON();
    assert.strictEqual(exported.__serverOnly, "server");
    assert.strictEqual(exported._test, "plop");
    assert.strictEqual(exported.test, "plop");
  }

  @test("Verify JSON stored export - stringify") jsonStoredExportStringify() {
    let object = this.secureConstructor();
    let exported = JSON.parse(object.toStoredJSON(true));
    assert.strictEqual(exported.__serverOnly, "server");
    assert.strictEqual(exported._test, "plop");
    assert.strictEqual(exported.test, "plop");
    assert.strictEqual(exported._gotContext, undefined);
  }

  @test("Verify Context access within output to server") async withContext() {
    let ctx = await this.newContext();
    let task = new Task();
    task.setContext(ctx);
    ctx.write(task);
    let result = JSON.parse(<string>ctx.getResponseBody());
    assert.strictEqual(result._gotContext, true);
  }

  @test async cov() {
    let task = new Task();
    assert.ok(CoreModel.instanceOf(task));
    await assert.rejects(() => new CoreModel().canAct(undefined, "test"), /403/);
    task.plop = 1;
    assert.ok(!task.isDirty());
    task = task.getProxy();
    assert.ok(!task.isDirty());
    task.plop = 2;
    assert.ok(task.isDirty());
    let store = {
      getService: this.webda.getService.bind(this.webda),
      delete: () => {},
      patch: () => {},
      get: async () => ({
        test: "123"
      })
    };
    task.__store = store;
    assert.strictEqual((await task.get()).test, "123");
    assert.strictEqual(task.getStore(), store);
    assert.notStrictEqual(task.generateUid(), undefined);
    let stub = sinon.stub(Task, "getUuidField").callsFake(() => "bouzouf");
    let deleteSpy = sinon.spy(store, "delete");
    let updateSpy = sinon.stub(store, "patch").callsFake(() => ({ plop: "bouzouf" }));
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
    assert.strictEqual(this.getService("ResourceService"), task.getService("ResourceService"));
    // @ts-ignore
    process.webda = Core.singleton = undefined;
    assert.throws(() => CoreModel.store(), /Webda not initialized/);
  }

  @test async ref() {
    let memoryStore = this.getService<Store>("MemoryUsers");
    memoryStore._models.push(TestMask);
    this.webda.getApplication().addModel("webdatest", TestMask);
    this.webda.getGlobalParams()["defaultStore"] = "MemoryUsers";
    assert.strictEqual(await TestMask.ref("unit1").exists(), false);
    // @ts-ignore
    let task = await (await TestMask.ref("unit1").get({ test: false })).save();
    assert.strictEqual(await TestMask.ref("unit1").exists(), true);
    await TestMask.ref("unit1").incrementAttributes([{ property: "counter", value: 1 }]);
    await TestMask.ref("unit1").setAttribute("side", "plop");
    await task.refresh();
    assert.strictEqual(task.counter, 1);
    assert.strictEqual(task.side, "plop");
    await TestMask.ref("unit1").removeAttribute("side");
    await TestMask.ref("unit1").conditionalPatch({ counter: 2 }, null, undefined);
    await task.refresh();
    assert.strictEqual(task.counter, 2);
    assert.strictEqual(task.side, undefined);
    await TestMask.ref("unit1").patch({ counter: 3 });
    await TestMask.ref("unit1").upsertItemToCollection("__typeTree", "plop");
    await task.refresh();
    assert.strictEqual(task.counter, 3);
    assert.deepStrictEqual(task.__typeTree, ["plop"]);
    await TestMask.ref("unit1").deleteItemFromCollection("__typeTree", 0, null);
    await task.refresh();
    assert.deepStrictEqual(task.__typeTree, []);
    await TestMask.ref("unit1").delete();
    assert.strictEqual(await TestMask.ref("unit1").exists(), false);
  }

  @test async fullUuid() {
    let memoryStore = this.getService<Store>("MemoryUsers");
    memoryStore._models.push(Task);
    this.webda.getApplication().addModel("webdatest/task", Task);
    this.webda.getGlobalParams()["defaultStore"] = "MemoryUsers";
    assert.strictEqual(new Task().__type, "webdatest/task");
    assert.notStrictEqual(new Task().__store, undefined);
    let task = await (await Task.ref("task#1").get({ test: false })).save();
    assert.strictEqual(task.getFullUuid(), "webdatest-task$task#1");
    let taskB = await this.webda.getModelObject("webdatest-task$task#1");
    // @ts-ignore
    assert.strictEqual(taskB.test, false);
    taskB = await this.webda.getModelObject(task.getFullUuid(), { test: true });
    // @ts-ignore
    assert.strictEqual(taskB.test, true);
  }

  @test async refresh() {
    let task = new Task();
    task.__store = {
      get: () => undefined
    };
    await task.refresh();
    task.__store = {
      get: () => ({ plop: "bouzouf" })
    };
    await task.refresh();
    assert.strictEqual(task.plop, "bouzouf");
  }

  @test
  async isDirty() {
    let task = new Task().getProxy();
    assert.ok(!task.isDirty());
    task.plop = [];
    // Adding a property
    assert.ok(task.isDirty());
    task.__dirty.clear();
    // Array element
    task.plop.push("plop");
    assert.ok(task.isDirty());
    task.__dirty.clear();
    // Object element
    task.plop2 = {
      array: [],
      test: true
    };
    assert.ok(task.isDirty());
    task.__dirty.clear();
    task.plop2.array.push("plop2");
    assert.ok(task.isDirty());
    task.__dirty.clear();
    task.plop2.newProp = 1;
    assert.ok(task.isDirty());
    task.__dirty.clear();
    delete task.plop2.newProp;
    assert.ok(task.isDirty());
    task.__dirty.clear();
    task.plop2.array.push("plop5");
    task.plop2.array.push("plop2");
    task.__dirty.clear();
    task.plop2.array.sort();
    assert.ok(task.isDirty());
    task.__dirty.clear();
    delete task.plop2.array[1];
    assert.ok(task.isDirty());
    task.__store = {
      patch: () => undefined
    };
    await task.save();
    assert.ok(!task.isDirty());
    delete task.plop2;
    assert.ok(task.isDirty());
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
            attribute: "maps"
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
    let test = new TestMask().load({ card: "plop", maps: [{ uuid: "uuid-test" }] }, true);
    await new TestMask().load({ side: "uuid-test" }).save();
    await new TestMask().load({ side: "uuid-test", card: "plip" }).save();
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
    assert.strictEqual((await test.links_simple[0].get()).card, "plop");
    assert.strictEqual((await test.parent.get()).card, "plop");
    assert.strictEqual((await test.maps[0].get()).card, "plop");
    assert.strictEqual((await test.queries.getAll()).length, 2);
    console.log("Test query now");
    assert.strictEqual((await test.queries.query("card = 'pliX?XXXX?XXXX?X???'")).results.length, 1);
    console.log("Test for each");
    let count = 0;
    await test.queries.forEach(async () => {
      count++;
    });
    assert.strictEqual(count, 2);
  }
}
