import { StoreTest } from "./store.spec";
import { FileStore, CoreModel, Store } from "../index";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { HttpContext } from "../utils/context";

@suite
class MemoryStoreTest extends StoreTest {
  getIdentStore(): Store<any> {
    return <Store<any>>this.getService("MemoryIdents");
  }

  getUserStore(): Store<any> {
    return <Store<any>>this.getService("MemoryUsers");
  }

  @test async deleteAsyncHttp() {
    let executor, ctx;
    ctx = await this.webda.newContext(new HttpContext("test.webda.io", "GET", "/memory/idents/ToDelete"));
    let identStore: Store<CoreModel> = this.getIdentStore();
    await identStore.save({
      uuid: "toDelete",
      test: "ok"
    });
    await identStore.delete("toDelete");
    executor = this.getExecutor(ctx, "test.webda.io", "GET", "/memory/idents/toDelete");
    assert.notStrictEqual(executor, undefined);
    await this.assertThrowsAsync(executor.execute.bind(executor, ctx), err => err == 404);
    executor = this.getExecutor(ctx, "test.webda.io", "PUT", "/memory/idents/toDelete");
    assert.notStrictEqual(executor, undefined);
    await this.assertThrowsAsync(executor.execute.bind(executor, ctx), err => err == 404);
    executor = this.getExecutor(ctx, "test.webda.io", "DELETE", "/memory/idents/toDelete");
    assert.notStrictEqual(executor, undefined);
    await this.assertThrowsAsync(executor.execute.bind(executor, ctx), err => err == 404);
  }
}

export { MemoryStoreTest };
