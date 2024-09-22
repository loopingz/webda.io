import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { EventEmitter } from "events";
import * as fs from "fs";
import { mkdirSync, writeFileSync } from "fs";
import pkg from "fs-extra";
import sinon from "sinon";
import { Readable } from "stream";
import { Core } from "../core";
import * as WebdaError from "../errors";
import { CoreModel } from "../models/coremodel";
import { WebdaTest } from "../test";
import { FileUtils } from "../utils/serializers";
import {
  BinariesImpl,
  BinariesItem,
  Binary,
  BinaryFile,
  BinaryFileInfo,
  BinaryService,
  MemoryBinaryFile
} from "./binary";
import { BinaryTest, TestBinaryService } from "./binary.spec";
import { FileBinary } from "./filebinary";
const { removeSync } = pkg;

class FaultyBinaryFile extends BinaryFile {
  async get() {
    const stream = new Readable();
    stream._read = () => {
      stream.emit("error", new Error("Faulty stream"));
    };
    return stream;
  }
}
@suite
class FileBinaryTest<T extends FileBinary = FileBinary> extends BinaryTest<T> {
  /**
   * @override
   */
  async getBinary(): Promise<T> {
    // @ts-ignore
    return this.addService(FileBinary, {
      folder: "./test/data/binaries",
      models: {
        "*": ["*"],
        "WebdaDemo/User": ["images"]
      },
      url: "/binary/"
    });
  }

  @test
  testEmpty() {
    assert.strictEqual(new Binary("test", <any>{}).isEmpty(), true);
    assert.strictEqual(new Binary("test", <any>{ test: {} }).isEmpty(), false);
  }

  @test
  async _getFile() {
    const binary = await this.getBinary();
    const ctx = await this.newContext();
    ctx.getHttpContext().setBody("plop");
    ctx.getParameters()["mimetype"] = "text/plain";
    assert.deepStrictEqual(
      await binary.getFile(ctx),
      new MemoryBinaryFile(Buffer.from("plop"), {
        challenge: "0c5a5d8b2b6b84c6ea966d0751f80366",
        hash: "64a4e8faed1a1aa0bf8bf0fc84938d25",
        metadata: {},
        mimetype: "text/plain",
        name: "",
        size: 4
      })
    );
  }

  @test
  async downloadSignedUrl() {
    const binary: FileBinary = (await this.getBinary()) as FileBinary;
    const { user1, ctx } = await this.setupDefault(false);

    const url = await binary.getRedirectUrlFromObject(user1.images[0], ctx, 60);
    assert.notStrictEqual(url, undefined);
    await this.execute(ctx, "test.webda.io", "GET", url.substring("http://test.webda.io".length));
    // c59d?token -> d59d?token
    await assert.rejects(
      () =>
        this.execute(
          ctx,
          "test.webda.io",
          "GET",
          url.substring("http://test.webda.io".length).replace("c59d?token", "d59d?token")
        ),
      WebdaError.Forbidden
    );
    await assert.rejects(
      () =>
        this.execute(
          ctx,
          "test.webda.io",
          "GET",
          url.substring("http://test.webda.io".length).replace("eyJhbG", "ezJhbG")
        ),
      WebdaError.Forbidden
    );
  }

  @test
  async verifyMapAndStore() {
    const binary = await this.getBinary();
    const ctx = await this.newContext();
    ctx.setParameters({ model: "User", property: "images" });
    const model = this.webda.getModel("User").store();
    assert.strictEqual(binary["verifyMapAndStore"](ctx), model);

    const stub = sinon.stub(binary, "handleBinary").callsFake(() => -1);
    try {
      assert.throws(
        () => binary["verifyMapAndStore"](ctx),
        (err: WebdaError.HttpError) => err.getResponseCode() === 404
      );
    } finally {
      stub.restore();
    }
  }

  @test
  async computeParameters() {
    const binary = <FileBinary>await this.getBinary();
    removeSync(binary.getParameters().folder);
    binary.computeParameters();
    assert.ok(fs.existsSync(binary.getParameters().folder));
  }

  @test
  async badTokens() {
    const binary = <FileBinary>await this.getBinary();
    const ctx = await this.newContext();
    const { hash } = await new MemoryBinaryFile(Buffer.from("PLOP"), <BinaryFileInfo>(<unknown>{})).getHashes();
    let token = "badt";
    ctx.setParameters({
      hash,
      token
    });
    ctx.getHttpContext().setBody("PLOP");
    await assert.rejects(
      () => binary.storeBinary(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
    token = await this.webda.getCrypto().jwtSign({ hash: "PLOP2" });
    ctx.setParameters({
      hash,
      token
    });
    await assert.rejects(
      () => binary.storeBinary(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
    // expired token
    token = await this.webda.getCrypto().jwtSign({ hash, exp: Math.floor(Date.now() / 1000) - 60 * 60 });
    ctx.setParameters({
      hash,
      token
    });
    await assert.rejects(
      () => binary.storeBinary(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
    token = await this.webda.getCrypto().jwtSign({ hash });
    ctx.setParameters({
      hash,
      token
    });
    await assert.rejects(
      () => binary.storeBinary(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 412
    );
  }

  @test
  async cleanNonExisting() {
    const binary = <FileBinary>await this.getBinary();
    binary._cleanHash("plop");
    binary._cleanUsage("plop", "l");
  }

  @test
  faultyBinary() {
    const file = new FaultyBinaryFile({
      mimetype: "text/plain",
      name: "test.txt",
      size: 10
    });
    assert.rejects(() => file.getHashes(), /Faulty stream/);
  }

  @test
  async cov() {
    const binary = <FileBinary>await this.getBinary();
    try {
      binary._touch("./touch.txt");
      binary._touch("./touch.txt");
    } finally {
      fs.unlinkSync("./touch.txt");
    }
  }

  @test
  async getOperationName() {
    const binary = await this.getBinary();
    binary["_name"] = "Binary";
    // @ts-ignore
    assert.strictEqual(binary.getOperationName(), "");
    // @ts-ignore
    binary._name = "Other";
    // @ts-ignore
    assert.strictEqual(binary.getOperationName(), binary.getName());
  }

  @test
  async handleBinary() {
    await this.registerService(
      new FileBinary(Core.get(), "second", {
        folder: "./test/data/binaries",
        models: {}
      })
    );
    const binaries: { [key: string]: BinaryService } = <any>Core.get().getServicesOfType(<any>BinaryService);
    const user = Core.get().getModel("Webda/User");

    assert.strictEqual(Core.get().getBinaryStore(user, "images"), binaries["FileBinary"]);
    binaries["FileBinary"].getParameters().models = {};
    assert.throws(
      () => Core.get().getBinaryStore(user, "profilePicture"),
      /No binary store found for Webda\/User profilePicture/
    );
    binaries["FileBinary"].getParameters().models = {
      "Webda/User": ["*"]
    };
    binaries["second"].getParameters().models = {
      "Webda/User": ["profilePicture"]
    };
    assert.strictEqual(Core.get().getBinaryStore(user, "profilePicture"), binaries["second"]);
  }

  /**
   * Test that we can use binary attributes
   */
  @test
  async binaryAttributes() {
    const user: any = await this.webda.getModel("WebdaDemo/ImageUser").create({});
    await user.profile.upload(new MemoryBinaryFile(Buffer.from("PLOP"), <BinaryFileInfo>(<unknown>{})));
    await user.images.upload(new MemoryBinaryFile(Buffer.from("PLOP2"), <BinaryFileInfo>(<unknown>{})));

    let files = await FileUtils.find("./test/data/binaries");
    assert.deepStrictEqual(files, [
      `test/data/binaries/f15c25d20d6b9a631ab6de08cd00035e/Registry_profile_${user.getUuid()}`,
      "test/data/binaries/f15c25d20d6b9a631ab6de08cd00035e/_9eed42d099ec7ef1eed00a49e8079cd2",
      "test/data/binaries/f15c25d20d6b9a631ab6de08cd00035e/data",
      `test/data/binaries/ff1cee367d40cacc3fe5f23e985c29ae/Registry_images_${user.getUuid()}`,
      "test/data/binaries/ff1cee367d40cacc3fe5f23e985c29ae/_0a4ef38590e0bd4a8999f1489186bbe9",
      "test/data/binaries/ff1cee367d40cacc3fe5f23e985c29ae/data"
    ]);
    await user.profile.delete();

    files = await FileUtils.find("./test/data/binaries");
    assert.deepStrictEqual(files, [
      `test/data/binaries/ff1cee367d40cacc3fe5f23e985c29ae/Registry_images_${user.getUuid()}`,
      "test/data/binaries/ff1cee367d40cacc3fe5f23e985c29ae/_0a4ef38590e0bd4a8999f1489186bbe9",
      "test/data/binaries/ff1cee367d40cacc3fe5f23e985c29ae/data"
    ]);
    await user.images[0].upload(
      new MemoryBinaryFile(Buffer.from("0123456789"), {
        mimetype: "text/plain",
        name: "test.txt",
        size: 10
      })
    );
    await user.images[0].delete();

    files = await FileUtils.find("./test/data/binaries");
    assert.deepStrictEqual(files, []);
  }
}

@suite
class BinaryAbstractTest extends WebdaTest {
  @test
  async cov() {
    const service = new TestBinaryService(undefined, "plop", {});
    assert.strictEqual(await service.getRedirectUrlFromObject(undefined, undefined, 60), null);
    let ctx = await this.newContext();
    await assert.rejects(
      () => service.putRedirectUrl(undefined),
      (err: WebdaError.HttpError) => err.getResponseCode() === 404
    );
    ctx.getHttpContext().setBody({
      hash: "plop"
    });
    /* TODO Move to RESTDomain
    await assert.rejects(
      () => service.httpChallenge(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 400
    );
    */
    ctx = await this.newContext();
    /* TODO Move to RESTDomain
    ctx.getHttpContext().setBody({
      challenge: "plop"
    });
    await assert.rejects(
      () => service.httpChallenge(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 400
    );
    */
    ctx = await this.newContext();
    const binary = this.getService<BinaryService>("binary");
    ctx.setParameters({
      property: "images",
      store: "users",
      uid: "notfound",
      index: 0
    });
    ctx.getHttpContext().setBody({
      hash: "p",
      challenge: "z"
    });
    /* TODO Move to RESTDomain
    await assert.rejects(
      () => binary.httpChallenge(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 404
    );
    */

    const stubs = [];
    try {
      const model = <any>{
        images: [
          {
            size: 10
          }
        ],
        canAct: async () => true,
        checkAct: async () => {}
      };
      stubs.push(
        sinon.stub(binary, "getRedirectUrlFromObject").callsFake(() => {
          return null;
        })
      );
      /*
      stubs.push(
        sinon.stub(binary, "verifyMapAndStore").callsFake(() => {
          return (<any>{
            get: async () => {
              return model as CoreModel;
            }
          }) as Store<CoreModel>;
        })
      );
      stubs.push(
        // @ts-ignore
        sinon.stub(binary, "get").callsFake(async () => {
          return Readable.from("PLOP");
        })
      );
      await binary.httpGet(ctx);
      assert.strictEqual(ctx.getResponseBody().toString(), "PLOP");
      stubs[stubs.length - 1].callsFake(async () => {
        return {
          pipe: stream => {
            stream.emit("error", new Error("I/O"));
          }
        };
      });
      await assert.rejects(() => binary.httpGet(ctx));
      let uri = ctx.getHttpContext().getRelativeUri();
      let url = ctx.getHttpContext().getAbsoluteUrl();
      ctx.getHttpContext().getRelativeUri = () => uri + "/url";
      ctx.getHttpContext().getAbsoluteUrl = () => url + "/url";
      await binary.httpGet(ctx);
      assert.strictEqual(ctx.getResponseBody(), `{"Location":"http://test.webda.io/","Map":{"size":10}}`);
      */
    } finally {
      stubs.forEach(stub => stub.restore());
    }
  }

  @test
  async handleBinary() {
    const binaryService = this.getService<BinaryService>("binary");
    assert.strictEqual(binaryService.handleBinary("WebdaDemo/User", "images"), 2);
    assert.strictEqual(binaryService.handleBinary("WebdaDemo/User", "profilePicture"), 0);
    assert.strictEqual(binaryService.handleBinary("WebdaDemo/User2", "images"), 0);
    binaryService.getParameters().models["*"] = ["images"];
    assert.strictEqual(binaryService.handleBinary("WebdaDemo/User2", "images"), 1);
    assert.strictEqual(binaryService.handleBinary("WebdaDemo/User2", "images2"), -1);
  }

  @test
  async binaryMaps() {
    const map = new BinariesImpl().assign(new CoreModel(), "test");
    await assert.rejects(() => map.upload(undefined));
    await assert.throws(() => map.shift());
    await assert.throws(() => map.unshift());
    await assert.throws(() => map.slice());
    await assert.throws(() => map.pop());

    const binary = new Binary("test", new CoreModel());
    await assert.rejects(() => binary.upload(undefined));
    await assert.rejects(() => binary.delete());
    const binaryItem = new BinariesItem(
      map,
      new MemoryBinaryFile(Buffer.from("test"), {
        name: "test",
        mimetype: "text/plain",
        size: 4
      })
    );
    await assert.rejects(() => binaryItem.upload(undefined));
    await assert.rejects(() => binaryItem.delete());
  }

  @test
  async streamToBufferError() {
    const stream = new EventEmitter();
    // @ts-ignore
    const p = assert.rejects(() => BinaryService.streamToBuffer(stream), /Bad I\/O/);
    stream.emit("error", new Error("Bad I/O"));
    await p;
  }

  @test
  async verifyMapStore() {
    const binaryService = this.getService<FileBinary>("binary");
    const ctx = await this.newContext();
    binaryService.handleBinary = () => -1;
    ctx.getParameters().model = "webda/test";
    assert.throws(() => binaryService["verifyMapAndStore"](ctx), WebdaError.NotFound);
  }

  @test
  async putRedirectUrl() {
    const binaryService = this.getService<FileBinary>("binary");
    const ctx = await this.newContext(JSON.stringify({ hash: "123" }));
    ctx.getParameters().uuid = "456";
    ctx.getParameters().store = "Test";
    ctx.getParameters().property = "plop";
    const dataPath = binaryService._getPath("123", "data");
    mkdirSync(binaryService._getPath("123"), { recursive: true });
    writeFileSync(binaryService._getPath("123", "Test_plop_456"), "");
    if (fs.existsSync(dataPath)) {
      fs.unlinkSync(dataPath);
    }
    /*
    let res = await binaryService.putRedirectUrl(ctx);
    assert.notStrictEqual(res, undefined);
    writeFileSync(dataPath, "data");
    res = await binaryService.putRedirectUrl(ctx);
    assert.strictEqual(res, undefined);
    */
  }
}

export { FileBinaryTest };
