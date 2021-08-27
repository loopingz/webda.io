import { WebdaTest } from "../test";
import * as assert from "assert";
import * as fs from "fs";
import { Binary, Store } from "..";
import { test } from "@testdeck/mocha";

class BinaryTest<T extends Binary = Binary> extends WebdaTest {
  getUrlResult: string = undefined;

  getUserStore(): Store<any> {
    return <Store<any>>this.getService("Users");
  }

  getBinary(): T {
    return <T>this.getService<T>("binary");
  }

  getMap(): string {
    return "images";
  }

  getExposePath(): string {
    return "/binary";
  }

  getTestFile(): string {
    return process.cwd() + "/test/Dockerfile.txt";
  }

  async before(init: boolean = true) {
    await super.before(init);
    let userStore = this.getUserStore();
    let binary = this.getBinary();
    assert.notStrictEqual(userStore, undefined);
    assert.notStrictEqual(binary, undefined);
    await userStore.__clean();
    await binary.__clean();
  }

  @test
  async normal() {
    let userStore = this.getUserStore();
    let binary = this.getBinary();
    let map = this.getMap();
    let exposePath = this.getExposePath();
    var eventFired = 0;
    var events = ["Binary.Get", "Binary.Update", "Binary.Create", "Binary.Delete"];
    for (let evt in events) {
      binary.on(events[evt], function () {
        eventFired++;
      });
    }
    // Check CREATE - READ
    var hash;
    var user1;
    var user2;
    var user;
    var ctx;
    user1 = await userStore.save({
      test: "plop"
    });
    user2 = await userStore.save({
      test: "plop"
    });
    await binary.store(
      user1,
      map,
      {
        path: this.getTestFile()
      },
      {}
    );
    user1 = await userStore.get(user1.uuid);
    assert.notStrictEqual(user1[map], undefined);
    assert.strictEqual(user1[map].length, 1);
    hash = user1[map][0].hash;
    let value = await binary.getUsageCount(hash);
    assert.strictEqual(value, 1);
    await binary.store(
      user2,
      map,
      {
        path: this.getTestFile()
      },
      {}
    );
    user = await userStore.get(user2.uuid);
    assert.notStrictEqual(user[map], undefined);
    assert.strictEqual(user[map].length, 1);
    assert.strictEqual(user[map][0].constructor.name, "BinaryMap");
    hash = user[map][0].hash;
    value = await binary.getUsageCount(hash);
    assert.strictEqual(value, 2);
    await binary.delete(user, map, 0);
    user = await userStore.get(user2.uuid);
    assert.strictEqual(user[map].length, 0);
    value = await binary.getUsageCount(hash);
    assert.strictEqual(value, 1);
    // Try to get images on user1 as user2
    ctx = await this.newContext({
      type: "CRUD",
      uuid: "PLOP"
    });
    ctx.session.userId = user2.uuid;
    let executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      exposePath + "/users/" + user1.uuid + "/" + map + "/0"
    );
    await assert.rejects(executor.execute(ctx), res => res == 403);
    ctx.session.userId = user1.uuid;
    executor = this.getExecutor(ctx, "test.webda.io", "GET", exposePath + "/users/" + user1.uuid + "/" + map + "/0");
    await executor.execute(ctx);
    // We dont check for result as FileBinary will return datas and S3 a redirect
    if (fs.existsSync("./downloadTo.tmp")) {
      fs.unlinkSync("./downloadTo.tmp");
    }
    await binary.downloadTo(user1[map][0], "./downloadTo.tmp");
    // Check the result is the same
    assert.strictEqual(fs.readFileSync("./downloadTo.tmp").toString(), fs.readFileSync(this.getTestFile()).toString());
    if (fs.existsSync("./downloadTo.tmp")) {
      fs.unlinkSync("./downloadTo.tmp");
    }
    await user1[map][0].downloadTo("./downloadTo.tmp");
    assert.strictEqual(fs.readFileSync("./downloadTo.tmp").toString(), fs.readFileSync(this.getTestFile()).toString());
    if (fs.existsSync("./downloadTo.tmp")) {
      fs.unlinkSync("./downloadTo.tmp");
    }
    user1[map][0].get();

    // cov
    binary._get(user1[map][0]);
    assert.strictEqual(binary._getUrl(user1[map][0], ctx), this.getUrlResult);

    await userStore.delete(user1.uuid);
    value = await binary.getUsageCount(hash);
    assert.strictEqual(value, 0);
  }

  @test
  async notMapped() {
    let userStore = this.getUserStore();
    let binary = this.getBinary();
    let user1 = await userStore.save({
      test: "plop"
    });
    await assert.rejects(
      () =>
        binary.store(
          user1,
          "images2",
          {
            path: this.getTestFile()
          },
          {}
        ),
      err => true
    );
  }

  @test
  async update() {
    let userStore = this.getUserStore();
    let binary = this.getBinary();
    let map = this.getMap();
    var user1;
    var user;
    let hash;
    user1 = await userStore.save({
      test: "plop"
    });
    await binary.store(
      user1,
      map,
      {
        path: this.getTestFile()
      },
      {}
    );
    user = await userStore.get(user1.uuid);
    assert.notStrictEqual(user[map], undefined);
    assert.strictEqual(user[map].length, 1);
    let value = await binary.getUsageCount(user[map][0].hash);
    assert.strictEqual(value, 1);
    await binary.update(
      user,
      map,
      0,
      {
        path: this.getTestFile()
      },
      {}
    );
    value = await binary.getUsageCount(user[map][0].hash);
    assert.strictEqual(value, 1);
    user = await userStore.get(user1.uuid);
    assert.notStrictEqual(user[map], undefined);
    assert.strictEqual(user[map].length, 1);
    assert.notStrictEqual(hash, user[map][0].hash);
    assert.strictEqual(user[map][0].mimetype, "text/plain");
    assert.strictEqual(user[map][0].name, "Dockerfile.txt");
    value = await binary.getUsageCount(hash);
    assert.strictEqual(value, 0);
    value = await binary.getUsageCount(user[map][0].hash);
    assert.strictEqual(value, 1);
  }
}

export { BinaryTest };
