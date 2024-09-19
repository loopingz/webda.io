import { suite, test } from "@testdeck/mocha";
import { FileBinary } from "@webda/core";
import { WebdaSimpleTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { BinaryModel } from "./binarymodel";

interface TestData {
  test: string;
  array: number[];
}
@suite
class BinaryModelTest extends WebdaSimpleTest {
  @test
  async binary() {
    await this.registerService(new FileBinary(this.webda, "file", { folder: "/tmp", models: { "*": ["*"] } }))
      .resolve()
      .init();
    const model = new BinaryModel().load({}, true);
    // @ts-ignore
    model.uuid = "test";
    assert.strictEqual(model.needsUpload(), false);
    model.data = {
      test: "OK"
    };
    assert.strictEqual(model.needsUpload(), true);
    await model.save();
    assert.strictEqual(model.needsUpload(), false);
    await model.save();
    model.data.test = "OK2";
    assert.strictEqual(model.needsUpload(), true);
    await model.save();
    const stored = <BinaryModel<TestData>>await BinaryModel.ref("test").get();
    await stored.loadData();
    // Call it twice to check that it is not downloaded twice
    await stored.loadData();
    await stored.loadData(true);
    // @ts-ignore
    assert.strictEqual(stored.data.test, "OK2");

    stored.data.array = [1, 2, 3];
    stored.data.array.push(4);
    delete stored.data.array[1];
    delete stored.data.test;
  }
}
