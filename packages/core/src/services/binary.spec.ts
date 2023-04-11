import { test } from "@testdeck/mocha";
import * as assert from "assert";
import axios from "axios";
import * as fs from "fs";
import * as sinon from "sinon";
import { Store, User, WebContext, WebdaError } from "../index";
import { CoreModel } from "../models/coremodel";
import { WebdaTest } from "../test";
import {
  BinaryEvents,
  BinaryFileInfo,
  BinaryMap,
  BinaryNotFoundError,
  BinaryService,
  LocalBinaryFile,
  MemoryBinaryFile
} from "./binary";
export class ImageUser extends User {
  images: BinaryMap[];
}

export class TestBinaryService extends BinaryService {
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

class BinaryTest<T extends BinaryService = BinaryService> extends WebdaTest {
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
    this.cleanFiles.push("./downloadTo.tmp");
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
    var events: (keyof BinaryEvents)[] = ["Binary.Get", "Binary.Create", "Binary.Delete"];
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
    this.log("DEBUG", "Initializing users");
    user1 = await userStore.save({
      test: "plop"
    });
    user2 = await userStore.save({
      test: "plop"
    });
    this.log("DEBUG", "Store a local file");
    await binary.store(user1, map, new LocalBinaryFile(this.getTestFile()), {});
    user1 = await userStore.get(user1.uuid);
    assert.notStrictEqual(user1[map], undefined);
    assert.strictEqual(user1[map].length, 1);
    hash = user1[map][0].hash;
    this.log("DEBUG", "Get usage count");
    let value = await binary.getUsageCount(hash);
    assert.strictEqual(value, 1);
    this.log("DEBUG", "Store same local file on separate object");
    await binary.store(user2, map, new LocalBinaryFile(this.getTestFile()), {});
    user = await userStore.get(user2.uuid);
    assert.notStrictEqual(user[map], undefined);
    assert.strictEqual(user[map].length, 1);
    assert.strictEqual(user[map][0].constructor.name, "BinaryMap");
    hash = user[map][0].hash;
    this.log("DEBUG", "Verify usage count");
    value = await binary.getUsageCount(hash);
    assert.strictEqual(value, 2);
    this.log("DEBUG", "Delete one attached object");
    await binary.delete(user, map, 0);
    user = await userStore.get(user2.uuid);
    assert.strictEqual(user[map].length, 0);
    this.log("DEBUG", "Verify usage count decreased");
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
    this.log("DEBUG", "Verify permission check on HTTP GET");
    await assert.rejects(executor.execute(ctx), (err: WebdaError.HttpError) => err.getResponseCode() === 403);
    ctx.session.userId = user1.uuid;
    this.log("DEBUG", "Verify valid permission check on HTTP GET");
    executor = this.getExecutor(ctx, "test.webda.io", "GET", exposePath + "/users/" + user1.uuid + "/" + map + "/0");
    await executor.execute(ctx);
    // We dont check for result as FileBinary will return datas and S3 a redirect
    if (fs.existsSync("./downloadTo.tmp")) {
      fs.unlinkSync("./downloadTo.tmp");
    }
    this.log("DEBUG", "BinaryMap downloadTo");
    await binary.downloadTo(user1[map][0], "./downloadTo.tmp");
    // Check the result is the same
    assert.strictEqual(fs.readFileSync("./downloadTo.tmp").toString(), fs.readFileSync(this.getTestFile()).toString());
    fs.unlinkSync("./downloadTo.tmp");
    this.log("DEBUG", "BinaryMap downloadTo from CoreModel");
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
      this.log("DEBUG", "BinaryMap downloadTo with I/O issues");
      await assert.rejects(() => binary.downloadTo(user1[map][0], "./downloadTo.tmp"));
      assert.ok(!fs.existsSync("./downloadTo.tmp"));
    } finally {
      stub.restore();
      if (stub2) {
        stub2.restore();
      }
    }
    this.log("DEBUG", "Check get stream");
    let buf1 = await BinaryService.streamToBuffer(await user1[map][0].get());

    // cov
    let buf2 = await BinaryService.streamToBuffer(await binary._get(user1[map][0]));

    assert.strictEqual(buf1.toString(), buf2.toString());
    this.log("DEBUG", "Delete CoreModel and ensure usage count");
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
    binary.getParameters().models = {};
    await assert.rejects(
      () => binary.store(user1, "images2", new LocalBinaryFile(this.getTestFile()), {}),
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
    await binary.store(user1, map, new LocalBinaryFile(this.getTestFile()), {});
    user = await userStore.get(user1.uuid);
    assert.notStrictEqual(user[map], undefined);
    assert.strictEqual(user[map].length, 1);
    let value = await binary.getUsageCount(user[map][0].hash);
    assert.strictEqual(value, 1);
  }

  @test
  checkMap() {
    let binary = this.getBinary();
    // @ts-ignore
    assert.throws(() => binary.checkMap("plop", "pouf"), /Unknown mapping/);
  }

  @test
  async httpCreate() {
    let userStore = this.getUserStore();
    let user1 = await userStore.save({
      test: "plop"
    });
    let ctx = await this.newContext();
    let executor = this.getExecutor(ctx, "test.webda.io", "POST", `/binary/users/${user1.getUuid()}/images`, {});
    await assert.rejects(
      () => executor.execute(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );

    /**
     * Two modes should be handled
     *
     * POST body + X-Webda-Metadatas header
     * POST multipart
     */
    ctx.getHttpContext().setBody("MY_IMAGE");
    ctx.getSession().login(user1.getUuid(), "fake");
    // Need to verify
    await executor.execute(ctx);
  }

  @test
  async httpDelete() {
    let { user1, ctx } = await this.setupDefault(false);
    let executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "DELETE",
      `/binary/users/${user1.getUuid()}/images/0/myhash`,
      {}
    );
    await assert.rejects(() => executor.execute(ctx), WebdaError.Forbidden, "DELETE binary w/o permission");
    // Now login
    ctx.getSession().login(user1.getUuid(), "fake");
    executor = this.getExecutor(ctx, "test.webda.io", "DELETE", `/binary/users/${user1.getUuid()}/images/0/myhash`, {});
    await assert.rejects(
      () => executor.execute(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 400
    );
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
  }

  @test
  getOperationName() {
    let binary = this.getBinary();
    // @ts-ignore
    assert.strictEqual(binary.getOperationName(), "");
    // @ts-ignore
    binary._name = "Other";
    // @ts-ignore
    assert.strictEqual(binary.getOperationName(), binary.getName());
  }

  @test
  async httpGetError() {
    let { binary, user1, ctx } = await this.setupDefault();
    // @ts-ignore
    let stub = sinon.stub(binary, "get").callsFake(() => {
      return {
        pipe: stream => {
          stream.emit("error", new Error("IO UnitTest"));
        }
      };
    });
    await this.execute(ctx, "test.webda.io", "GET", `/binary/users/${user1.getUuid()}/images/0`, {});
    await assert.rejects(
      () =>
        this.execute(
          ctx,
          "test.webda.io",
          "GET",
          ctx.getResponseHeaders().Location.substring("http://test.webda.io".length)
        ),
      /IO UnitTest/,
      "GET binary with I/O"
    );
    stub.restore();
  }

  @test
  async httpGet() {
    let { binary, user1, ctx } = await this.setupDefault(false);
    let executor = this.getExecutor(ctx, "test.webda.io", "GET", `/binary/users/${user1.getUuid()}/images/0`, {});
    // If not logged in
    await assert.rejects(() => executor.execute(ctx), WebdaError.Forbidden, "GET binary w/o permission");
    executor = this.getExecutor(ctx, "test.webda.io", "GET", `/binary/users/unknown/images/0`, {});
    await assert.rejects(() => executor.execute(ctx), WebdaError.NotFound, "GET binary on unknown object");

    // Login
    ctx.getSession().login(user1.getUuid(), "fake");

    executor = this.getExecutor(ctx, "test.webda.io", "GET", `/binary/users/${user1.getUuid()}/images/0`, {});
    await executor.execute(ctx);

    await binary.delete(user1, "images", 0);

    // Check 404 now it is gone
    executor = this.getExecutor(ctx, "test.webda.io", "GET", `/binary/users/${user1.getUuid()}/images/0`, {});
    await assert.rejects(
      () => executor.execute(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 404
    );
  }

  @test
  async httpMetadata() {
    let { binary, user1, ctx } = await this.setupDefault(false);
    let executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "PUT",
      `/binary/users/${user1.getUuid()}/images/0/${user1.images[0].hash}`,
      {}
    ); // If not logged in
    await assert.rejects(() => executor.execute(ctx), WebdaError.Forbidden, "PUT metadata w/o permission");
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "PUT",
      `/binary/users/unknown/images/0/${user1.images[0].hash}`,
      {}
    );
    await assert.rejects(() => executor.execute(ctx), WebdaError.NotFound, "GET binary on unknown object");

    // Login
    ctx.getSession().login(user1.getUuid(), "fake");

    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "PUT",
      `/binary/users/${user1.getUuid()}/images/0/${user1.images[0].hash}`,
      {
        "my-metadata": "updated",
        "my-other-metadata": true
      }
    );
    await executor.execute(ctx);
    let user = await this.getUserStore().get(ctx.getCurrentUserId());
    user.images[0].metadata ??= {};
    assert.strictEqual(user.images[0].metadata["my-metadata"], "updated");
    assert.strictEqual(user.images[0].metadata["my-other-metadata"], true);
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "PUT",
      `/binary/users/${user1.getUuid()}/images/0/${user1.images[0].hash}`,
      {
        "my-metadata": "updated".repeat(4096),
        "my-other-metadata": true
      }
    );
    await assert.rejects(
      () => executor.execute(ctx),
      WebdaError.BadRequest,
      "PUT metadata with big content should fail"
    );
  }

  @test
  async getNotFound() {
    await assert.rejects(
      () =>
        // @ts-ignore
        this.getBinary().get({
          hash: "none",
          mimetype: "",
          size: 10
        }),
      BinaryNotFoundError
    );
  }

  async setupDefault(withLogin: boolean = true): Promise<{
    userStore: Store;
    binary: BinaryService;
    user1: ImageUser;
    ctx: WebContext;
  }> {
    let userStore = this.getUserStore();
    let binary = this.getBinary();
    let user1: ImageUser = await userStore.save({
      test: "plop"
    });
    await binary.store(user1, "images", new LocalBinaryFile(this.getTestFile()));
    await user1.refresh();
    let ctx = await this.newContext();
    if (withLogin) {
      ctx.getSession().login(user1.getUuid(), "fake");
    }
    user1.setContext(ctx);
    return { userStore, binary, user1, ctx };
  }

  async testChallenge(remoteCheckHash: boolean = true) {
    let { userStore, binary, user1, ctx } = await this.setupDefault(false);
    let { hash, challenge } = await new MemoryBinaryFile(
      Buffer.from("PLOP"),
      <BinaryFileInfo>(<unknown>{})
    ).getHashes();
    let metadata = {
      plop: "test"
    };
    let executor = this.getExecutor(ctx, "test.webda.io", "PUT", `/binary/upload/users/${user1.getUuid()}/images`, {
      hash,
      challenge,
      metadata
    });
    await assert.rejects(
      () => executor.execute(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
    ctx.getSession().login(user1.getUuid(), "fake");
    await executor.execute(ctx);
    let info = JSON.parse(<string>ctx.getResponseBody());
    assert.ok(!info.done, "should not be done yet");
    // Execute twice as we should still get an upload
    await executor.execute(ctx);
    let url = new URL(info.url);

    if (url.host === "test.webda.io") {
      executor = this.getExecutor(
        ctx,
        "test.webda.io",
        info.method || "PUT",
        url.pathname + url.search,
        "PLOP2",
        info.headers
      );
      await assert.rejects(() => executor.execute(ctx));
      executor = this.getExecutor(
        ctx,
        "test.webda.io",
        info.method || "PUT",
        url.pathname + url.search,
        "PLOP",
        info.headers
      );
      await executor.execute(ctx);
    } else {
      if (remoteCheckHash) {
        await assert.rejects(() => this.sendChallengeData(info, "PLOP2"), "Should check content");
      }
      await this.sendChallengeData(info, "PLOP");
    }

    await user1.refresh();
    assert.strictEqual(user1.images.length, 2);
    assert.strictEqual((await BinaryService.streamToBuffer(await binary.get(user1.images[1]))).toString(), "PLOP");
    // If we try to re upload it should be already up
    executor = this.getExecutor(ctx, "test.webda.io", "PUT", `/binary/upload/users/${user1.getUuid()}/images`, {
      hash,
      challenge,
      metadata
    });
    await executor.execute(ctx);
    info = JSON.parse(<string>ctx.getResponseBody());
    assert.ok(info.done, "should be done");
    assert.ok(info.url === undefined);

    // Use another user to try adding same binary
    let user2 = await userStore.save({});
    ctx.getSession().login(user2.getUuid(), "fake");
    executor = this.getExecutor(ctx, "test.webda.io", "PUT", `/binary/upload/users/${user2.getUuid()}/images`, {
      hash,
      challenge,
      metadata
    });
    await executor.execute(ctx);
    info = JSON.parse(<string>ctx.getResponseBody());
    assert.ok(info.done, "should be done");
    assert.ok(info.url === undefined);
  }

  async sendChallengeData(info: any, data: string) {
    let res;
    try {
      res = await axios.request({
        method: info.method,
        url: info.url,
        data,
        headers: info.headers
      });
      return res;
    } catch (err) {
      console.log(
        "sendChallengeDataError",
        {
          method: info.method,
          url: info.url,
          data,
          headers: info.headers
        },
        err
      );
      throw err;
    }
  }
}

export { BinaryTest };
