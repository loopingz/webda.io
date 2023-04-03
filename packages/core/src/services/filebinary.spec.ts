import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as fs from "fs";
import pkg from "fs-extra";
import { Readable } from "stream";
import { Core } from "../core";
import { WebdaError } from "../errors";
import { CoreModel, CoreModelDefinition } from "../models/coremodel";
import { FileUtils } from "../utils/serializers";
import { Binaries, Binary, BinaryFile, BinaryFileInfo, BinaryService, MemoryBinaryFile } from "./binary";
import { CloudBinaryTest } from "./cloudbinary.spec";
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
class FileBinaryTest extends CloudBinaryTest {
  @test
  initMap() {
    let binary = this.getBinary();
    binary.initMap(undefined);
    binary.initMap({ _init: true });
    // Bad store
    binary.initMap({
      VersionService: {},
      None: {},
      MemoryIdents: "idents"
    });
  }

  @test
  async _getFile() {
    let binary = this.getBinary();
    let ctx = await this.newContext();
    ctx.getHttpContext().setBody("plop");
    ctx.getHttpContext().headers = { "content-type": "text/plain" };
    assert.deepStrictEqual(
      await binary._getFile(ctx),
      new MemoryBinaryFile(Buffer.from("plop"), {
        challenge: undefined,
        hash: undefined,
        metadata: {},
        mimetype: "text/plain",
        name: "",
        size: 4
      })
    );
  }

  @test
  initRoutes() {
    let binary = this.getBinary();
    binary.getParameters().expose = undefined;
    binary.initRoutes();
    // @ts-ignore
    binary._name = "Binary";
    binary.initRoutes();
  }

  @test
  async downloadSignedUrl() {
    let binary: FileBinary = this.getBinary() as FileBinary;
    let { user1, ctx } = await this.setupDefault(false);

    let url = await binary.getRedirectUrlFromObject(user1.images[0], ctx, 60);
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
    let binary = this.getBinary();
    let ctx = await this.newContext();
    ctx.setPathParameters({ store: "Store", property: "images" });
    assert.throws(
      () => binary._verifyMapAndStore(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 404
    );
    ctx.setPathParameters({ store: "users", property: "images" });
    assert.strictEqual(binary._verifyMapAndStore(ctx), this.getService("Users"));
    ctx.setPathParameters({ store: "users", property: "images2" });
    assert.throws(
      () => binary._verifyMapAndStore(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 404
    );
    ctx.setPathParameters({ store: "notexisting", property: "images" });
    assert.throws(
      () => binary._verifyMapAndStore(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 404
    );
  }

  @test
  computeParameters() {
    let binary = <FileBinary>this.getBinary();
    removeSync(binary.getParameters().folder);
    binary.computeParameters();
    assert.ok(fs.existsSync(binary.getParameters().folder));
  }

  @test
  async challenge() {
    await this.testChallenge();
  }

  @test
  async badTokens() {
    let binary = <FileBinary>this.getBinary();
    let ctx = await this.newContext();
    let { hash } = await new MemoryBinaryFile(Buffer.from("PLOP"), <BinaryFileInfo>(<unknown>{})).getHashes();
    let token = "badt";
    ctx.setPathParameters({
      hash,
      token
    });
    ctx.getHttpContext().setBody("PLOP");
    await assert.rejects(
      () => binary.storeBinary(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
    token = await this.webda.getCrypto().jwtSign({ hash: "PLOP2" });
    ctx.setPathParameters({
      hash,
      token
    });
    await assert.rejects(
      () => binary.storeBinary(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
    // expired token
    token = await this.webda.getCrypto().jwtSign({ hash, exp: Math.floor(Date.now() / 1000) - 60 * 60 });
    ctx.setPathParameters({
      hash,
      token
    });
    await assert.rejects(
      () => binary.storeBinary(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
    token = await this.webda.getCrypto().jwtSign({ hash });
    ctx.setPathParameters({
      hash,
      token
    });
    await assert.rejects(
      () => binary.storeBinary(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 412
    );
  }

  @test
  cleanNonExisting() {
    let binary = <FileBinary>this.getBinary();
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
  cov() {
    let binary = <FileBinary>this.getBinary();
    try {
      binary._touch("./touch.txt");
      binary._touch("./touch.txt");
    } finally {
      fs.unlinkSync("./touch.txt");
    }
  }

  @test
  async handleBinary() {
    this.registerService(
      new FileBinary(Core.get(), "second", {
        folder: "./test/data/binaries"
      })
    );
    const binaries: { [key: string]: BinaryService } = <any>Core.get().getServicesOfType(<any>BinaryService);
    const user = Core.get().getModel("WebdaDemo/User");
    assert.strictEqual(Core.get().getBinaryStore(user, "images"), binaries["binary"]);
    binaries["binary"].getParameters().models = {};
    assert.throws(
      () => Core.get().getBinaryStore(user, "profilePicture"),
      /No binary store found for WebdaDemo\/User profilePicture/
    );
    binaries["binary"].getParameters().models = {
      "WebdaDemo/User": ["*"]
    };
    binaries["second"].getParameters().models = {
      "WebdaDemo/User": ["profilePicture"]
    };
    assert.strictEqual(Core.get().getBinaryStore(user, "profilePicture"), binaries["second"]);
  }

  /**
   * Test that we can use binary attributes
   */
  @test
  async binaryAttributes() {
    const user: CoreModelDefinition<CoreModel & { images: Binaries; profilePicture: Binary }> =
      Core.get().getModel("WebdaDemo/User");
    const User = await new user().load({}, true).save();
    await User.profilePicture.upload(new MemoryBinaryFile(Buffer.from("PLOP"), <BinaryFileInfo>(<unknown>{})));
    await User.images.upload(new MemoryBinaryFile(Buffer.from("PLOP2"), <BinaryFileInfo>(<unknown>{})));
    await this.sleep(1000);
    let files = FileUtils.find("./test/data/binaries");
    assert.deepStrictEqual(files, [
      `test/data/binaries/f15c25d20d6b9a631ab6de08cd00035e/MemoryUsers_profilePicture_${User.getUuid()}`,
      "test/data/binaries/f15c25d20d6b9a631ab6de08cd00035e/_9eed42d099ec7ef1eed00a49e8079cd2",
      "test/data/binaries/f15c25d20d6b9a631ab6de08cd00035e/data",
      `test/data/binaries/ff1cee367d40cacc3fe5f23e985c29ae/MemoryUsers_images_${User.getUuid()}`,
      "test/data/binaries/ff1cee367d40cacc3fe5f23e985c29ae/_0a4ef38590e0bd4a8999f1489186bbe9",
      "test/data/binaries/ff1cee367d40cacc3fe5f23e985c29ae/data"
    ]);
    await User.profilePicture.delete();
    await this.sleep(1000);
    files = FileUtils.find("./test/data/binaries");
    assert.deepStrictEqual(files, [
      `test/data/binaries/ff1cee367d40cacc3fe5f23e985c29ae/MemoryUsers_images_${User.getUuid()}`,
      "test/data/binaries/ff1cee367d40cacc3fe5f23e985c29ae/_0a4ef38590e0bd4a8999f1489186bbe9",
      "test/data/binaries/ff1cee367d40cacc3fe5f23e985c29ae/data"
    ]);
    await User.images[0].delete();
    await this.sleep(1000);
    files = FileUtils.find("./test/data/binaries");
    assert.deepStrictEqual(files, []);
  }
}

export { FileBinaryTest };
