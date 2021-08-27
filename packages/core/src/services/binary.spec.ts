import { WebdaTest } from "../test";
import * as assert from "assert";
import * as fs from "fs";
import { Binary, Store, User } from "..";
import { suite, test } from "@testdeck/mocha";
import * as sinon from "sinon";
import { CoreModel } from "../models/coremodel";
import { BinaryMap, BinaryNotFoundError } from "./binary";
import { StoreNotFoundError } from "../stores/store";

class ImageUser extends User {
  images: BinaryMap[];
}

class TestBinaryService extends Binary {
  store(object: CoreModel, property: string, file: any, metadatas: any, index?: number): Promise<any> {
    throw new Error("Method not implemented.");
  }
  getUsageCount(hash: any): Promise<number> {
    throw new Error("Method not implemented.");
  }
  update(object: any, property: any, index: any, file: any, metadatas: any): Promise<void> {
    throw new Error("Method not implemented.");
  }
  delete(object: CoreModel, property: string, index: number): Promise<void> {
    throw new Error("Method not implemented.");
  }
  challenge(hash: string, challenge: string) {
    throw new Error("Method not implemented.");
  }
  _get() {
    return null;
  }

  async cascadeDelete() {}
}

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
    fs.unlinkSync("./downloadTo.tmp");
    await user1[map][0].downloadTo("./downloadTo.tmp");
    assert.strictEqual(fs.readFileSync("./downloadTo.tmp").toString(), fs.readFileSync(this.getTestFile()).toString());
    fs.unlinkSync("./downloadTo.tmp");

    // Fake IO issue
    let stub = sinon.stub(binary, "_get").callsFake(() => {
      return {
        pipe: stream => {
          stream.emit("error", "bad read");
        }
      };
    });
    let stub2;
    try {
      await assert.rejects(() => binary.downloadTo(user1[map][0], "./downloadTo.tmp"));
      assert.ok(!fs.existsSync("./downloadTo.tmp"));
      stub2 = sinon.stub(fs, "unlinkSync").callsFake(() => {
        throw new Error();
      });
      await assert.rejects(() => binary.downloadTo(user1[map][0], "./downloadTo.tmp"));
    } finally {
      stub.restore();
      if (stub2) {
        stub2.restore();
      }
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

  @test
  checkMap() {
    let binary = this.getBinary();
    assert.throws(() => binary._checkMap("plop", "pouf"), /Unknown mapping/);
  }

  @test
  async httpCreate() {
    let userStore = this.getUserStore();
    let binary = this.getBinary();
    let user1 = await userStore.save({
      test: "plop"
    });
    let ctx = await this.newContext();
    let executor = this.getExecutor(ctx, "test.webda.io", "POST", `/binary/users/${user1.getUuid()}/images`, {});
    await assert.rejects(() => executor.execute(ctx), /403/);

    /**
     * Two modes should be handled
     *
     * POST body + X-Webda-Metadatas header
     * POST multipart
     */
    ctx.getHttpContext().setBody("MY_IMAGE");
    ctx.getSession().login(user1.getUuid(), "fake");
    // Know it is badly managed
    // PUT is in the same spot
  }

  @test
  async httpGetAndDelete() {
    let userStore = this.getUserStore();
    let binary = this.getBinary();
    let user1: ImageUser = await userStore.save({
      test: "plop"
    });
    await binary.store(user1, "images", { path: this.getTestFile() });
    await user1.refresh();
    let ctx = await this.newContext();
    let executor = this.getExecutor(ctx, "test.webda.io", "GET", `/binary/users/${user1.getUuid()}/images/0`, {});
    // If not logged in
    await assert.rejects(() => executor.execute(ctx), /403/);
    executor = this.getExecutor(ctx, "test.webda.io", "GET", `/binary/users/unknown/images/0`, {});
    await assert.rejects(() => executor.execute(ctx), /404/);
    executor = this.getExecutor(ctx, "test.webda.io", "DELETE", `/binary/users/${user1.getUuid()}/images/0/myhash`, {});
    await assert.rejects(() => executor.execute(ctx), /403/);
    // Now login
    ctx.getSession().login(user1.getUuid(), "fake");
    executor = this.getExecutor(ctx, "test.webda.io", "GET", `/binary/users/${user1.getUuid()}/images/0`, {});
    await executor.execute(ctx);
    // @ts-ignore
    let stub = sinon.stub(binary, "get").callsFake(() => {
      return {
        pipe: stream => {
          stream.emit("error", new Error("I/O"));
        }
      };
    });
    executor = this.getExecutor(ctx, "test.webda.io", "GET", `/binary/users/${user1.getUuid()}/images/0`, {});
    await assert.rejects(() => executor.execute(ctx), /500/);
    stub.restore();
    // Should not happen
    //user1.images[0].hash = "fakeone";
    //await user1.save();
    executor = this.getExecutor(ctx, "test.webda.io", "DELETE", `/binary/users/${user1.getUuid()}/images/0/myhash`, {});
    await assert.rejects(() => executor.execute(ctx), /412/);
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "DELETE",
      `/binary/users/${user1.getUuid()}/images/0/${user1.images[0].hash}`,
      {}
    );
    await executor.execute(ctx);
    await user1.refresh();
    assert.ok(user1.images.length === 0);
    // Check 404 now it is gone
    executor = this.getExecutor(ctx, "test.webda.io", "GET", `/binary/users/${user1.getUuid()}/images/0`, {});
    await assert.rejects(() => executor.execute(ctx), /404/);
  }

  @test
  async getNotFound() {
    await assert.rejects(
      () =>
        // @ts-ignore
        this.getBinary().get({
          hash: "none",
          mime: "",
          size: 10
        }),
      BinaryNotFoundError
    );
  }
}
@suite
class BinaryAbstractTest {
  @test
  async cov() {
    let service = new TestBinaryService(undefined, "plop", {});
    await assert.rejects(() => service.putRedirectUrl(undefined), /404/);
  }
}

export { BinaryTest };
