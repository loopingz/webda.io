import { suite, test } from "@testdeck/mocha";
import { MemoryStore } from "@webda/core";
import { WebdaSimpleTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { MigrationStore } from "./migration";

@suite
class MigrationTest extends WebdaSimpleTest {
  @test
  async test() {
    let from = await this.registerService(new MemoryStore(this.webda, "from", {}))
      .resolve()
      .init();
    let to = await this.registerService(new MemoryStore(this.webda, "to", {}))
      .resolve()
      .init();
    let migration = await this.registerService(new MigrationStore(this.webda, "migration", { from: "from", to: "to" }))
      .resolve()
      .init();
    for (let i = 1; i <= 1000; i++) {
      await from.save({ uuid: i.toString(), name: `test ${i}`, counter: i });
      if (i <= 100) {
        await to.save({ uuid: i.toString(), name: `test ${i}`, counter: i });
      }
    }
    assert.strictEqual((await migration.getAll()).length, 1000);
    await migration.save({ uuid: "1001", name: "test 1001", counter: 1001 });
    assert.strictEqual((await from.getAll()).length, 1001);
    assert.strictEqual((await to.getAll()).length, 101);
    await migration.patch(<any>{ uuid: "1001", toto: "OK" });
    await migration.patch(<any>{ uuid: "901", toto: "OK" });
    assert.strictEqual((<any>await migration.get("1001")).toto, "OK");
    assert.strictEqual((<any>await to.get("1001")).toto, "OK");
    assert.strictEqual((<any>await from.get("1001")).toto, "OK");
    // @ts-ignore
    await migration.incrementAttribute("1001", "counter", 10);
    assert.strictEqual((<any>await migration.get("1001")).counter, 1011);
    assert.strictEqual((<any>await to.get("1001")).counter, 1011);
    assert.strictEqual((<any>await from.get("1001")).counter, 1011);

    assert.ok(await migration.exists("1001"));
    assert.ok(!(await migration.exists("1002")));

    await migration.delete("900");
    await migration.update({ uuid: "1001", name: "test 1001", counter: 1001, collection: [] });
    await migration.update({ uuid: "901", name: "test 901b" });
    // @ts-ignore
    await migration.removeAttribute("1001", "toto");
    // @ts-ignore
    await migration.upsertItemToCollection("1001", "collection", { status: "OK" });
    assert.strictEqual((<any>await migration.get("1001")).collection[0].status, "OK");
    assert.strictEqual((<any>await to.get("1001")).collection[0].status, "OK");
    assert.strictEqual((<any>await from.get("1001")).collection[0].status, "OK");
    // @ts-ignore
    assert.rejects(() => migration.deleteItemFromCollection("1001", "collection", 0, "OKI", "status"));
    assert.strictEqual((<any>await migration.get("1001")).collection[0].status, "OK");
    assert.strictEqual((<any>await to.get("1001")).collection[0].status, "OK");
    assert.strictEqual((<any>await from.get("1001")).collection[0].status, "OK");
    // @ts-ignore
    await migration.deleteItemFromCollection("1001", "collection", 0, "OK", "status");
    assert.strictEqual((<any>await migration.get("1001")).collection.length, 0);
    assert.strictEqual((<any>await to.get("1001")).collection.length, 0);
    assert.strictEqual((<any>await from.get("1001")).collection.length, 0);

    // Test migration now
    await migration.migrate();
    assert.strictEqual((await from.getAll()).length, (await to.getAll()).length);
  }
}
