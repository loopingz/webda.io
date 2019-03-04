import { WebdaTest } from "../test";
import * as assert from "assert";
import * as fs from "fs";
import { Binary, Store } from "..";
import { test } from "mocha-typescript";

class BinaryTest extends WebdaTest {
  getUserStore(): Store<any> {
    return <Store<any>>this.getService("Users");
  }

  getBinary(): Binary {
    return <Binary>this.getService("binary");
  }

  getMap(): string {
    return "images";
  }

  getExposePath(): string {
    return "/binary";
  }

  getTestFile(): string {
    return process.cwd() + "/test/Dockerfile";
  }

  async before() {
    await super.before();
    let userStore = this.getUserStore();
    let binary = this.getBinary();
    assert.notEqual(userStore, undefined);
    assert.notEqual(binary, undefined);
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
    var events = ["binaryGet", "binaryUpdate", "binaryCreate", "binaryDelete"];
    for (let evt in events) {
      binary.on(events[evt], function() {
        eventFired++;
      });
    }
    // Check CREATE - READ
    var hash;
    var user1;
    var user2;
    var user;
    var ctx;
    var error;
    user1 = await userStore.save({
      test: "plop"
    });
    user2 = await userStore.save({
      test: "plop"
    });
    await binary.store(
      userStore,
      user1,
      map,
      {
        path: this.getTestFile()
      },
      {}
    );
    user1 = await userStore.get(user1.uuid);
    assert.notEqual(user1[map], undefined);
    assert.equal(user1[map].length, 1);
    hash = user1[map][0].hash;
    let value = await binary.getUsageCount(hash);
    assert.equal(value, 1);
    await binary.store(
      userStore,
      user2,
      map,
      {
        path: this.getTestFile()
      },
      {}
    );
    user = await userStore.get(user2.uuid);
    assert.notEqual(user[map], undefined);
    assert.equal(user[map].length, 1);
    assert.equal(user[map][0].constructor.name, "BinaryMap");
    hash = user[map][0].hash;
    value = await binary.getUsageCount(hash);
    assert.equal(value, 2);
    await binary.delete(userStore, user, map, 0);
    user = await userStore.get(user2.uuid);
    assert.equal(user[map].length, 0);
    value = await binary.getUsageCount(hash);
    assert.equal(value, 1);
    // Try to get images on user1 as user2
    ctx = this.webda.newContext({
      type: "CRUD",
      uuid: "PLOP"
    });
    error = false;
    ctx.session.userId = user2.uuid;
    let executor = this.webda.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      exposePath + "/users/" + user1.uuid + "/" + map + "/0"
    );
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 403
    );
    ctx.session.userId = user1.uuid;
    executor = this.webda.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      exposePath + "/users/" + user1.uuid + "/" + map + "/0"
    );
    await executor.execute(ctx);
    // We dont check for result as FileBinary will return datas and S3 a redirect
    if (fs.existsSync("./downloadTo.tmp")) {
      fs.unlinkSync("./downloadTo.tmp");
    }
    await binary.downloadTo(user1[map][0], "./downloadTo.tmp");
    // Check the result is the same
    assert.equal(
      fs.readFileSync("./downloadTo.tmp").toString(),
      fs.readFileSync(this.getTestFile()).toString()
    );
    await userStore.delete(user1.uuid);
    value = await binary.getUsageCount(hash);
    assert.equal(value, 0);
  }

  @test
  async notMapped() {
    let userStore = this.getUserStore();
    let binary = this.getBinary();
    let user1 = await userStore.save({
      test: "plop"
    });
    await this.assertThrowsAsync(
      binary.store.bind(
        binary,
        userStore,
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
      userStore,
      user1,
      map,
      {
        path: this.getTestFile()
      },
      {}
    );
    user = await userStore.get(user1.uuid);
    assert.notEqual(user[map], undefined);
    assert.equal(user[map].length, 1);
    let value = await binary.getUsageCount(user[map][0].hash);
    assert.equal(value, 1);
    await binary.update(
      userStore,
      user,
      map,
      0,
      {
        path: this.getTestFile()
      },
      {}
    );
    user = await userStore.get(user1.uuid);
    assert.notEqual(user[map], undefined);
    assert.equal(user[map].length, 1);
    assert.notEqual(hash, user[map][0].hash);
    assert.equal(user[map][0].mimetype, "text/plain");
    assert.equal(user[map][0].name, "Dockerfile.txt");
    value = await binary.getUsageCount(hash);
    assert.equal(value, 0);
    value = await binary.getUsageCount(user[map][0].hash);
    assert.equal(value, 1);
  }
}

export { BinaryTest };
