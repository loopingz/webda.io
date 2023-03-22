import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as fs from "fs";
import pkg from "fs-extra";
import { Readable } from "stream";
import { WebdaError } from "../errors";
import { BinaryFile, BinaryFileInfo, MemoryBinaryFile } from "./binary";
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
}

export { FileBinaryTest };
