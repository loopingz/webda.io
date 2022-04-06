import { BinaryTest } from "@webda/core/lib/services/binary.spec";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { Storage } from "./storage";
import * as sinon from "sinon";
import { Storage as GCS } from "@google-cloud/storage";
import path from "path";

class MockFile {
  constructor(path) {}
  async delete() {}
  async getFiles() {}
  async exists() {}
  async save() {}
  async setMetadata() {}
  async createWriteStream() {}
  async getSignedUrl() {}
  async publicUrl() {}
  async getMetadata() {}
  async createReadStream() {}
  async move() {}
}

class MockBucket {
  file(path: string) {
    return new MockFile(path);
  }
}
const BUCKET = "webda-dev";
@suite
class StorageTest extends BinaryTest<Storage> {
  prefix: string;
  async before() {
    this.buildWebda();
    await this.install();
    await super.before();
    this.prefix = this.getBinary().getWebda().getUuid();
    this.getBinary().getParameters().prefix = this.prefix;
    // Prepare for Mocked Version
    if (!process.env.NO_MOCK && false) {
      sinon.stub(this.getBinary(), "getStorageBucket").callsFake(() => {
        return new MockBucket();
      });
    }
  }

  async after() {
    await this.cleanData();
  }

  async install() {
    var storage = new GCS();
    try {
      let [metadata] = await storage.bucket(BUCKET).getMetadata();
      if (!metadata) {
        await storage.createBucket(BUCKET, { location: "US-WEST2", storageClass: "COLDLINE" });
        await storage.bucket(BUCKET).getMetadata();
      }
      //this.webda.log("INFO", `Google cloud storage bucket '${BUCKET}' exists`);
    } catch (e: any) {
      this.webda.log("ERROR", `Google cloud storage error (${e.message})`);
    }
  }

  async cleanData() {
    var storage = new GCS();
    const [files] = await storage.bucket(BUCKET).getFiles({
      prefix: this.prefix,
    });
    for (let file of files) {
      await file.delete();
    }
  }

  // Override getNotFound as exception is raised after
  // @test
  // async getNotFound() {}

  @test
  async putObject() {
    const body = `RAW Body: ${new Date()}`;
    const name = `${this.prefix}/plop/test`;
    await this.getBinary().putObject(name, Buffer.from(body), { meta1: "meta1" }, BUCKET);
    let getFile = this.getBinary().getStorageBucket().file(name);

    assert.deepStrictEqual((await getFile.getMetadata())[0].metadata, { meta1: "meta1" });
  }

  // Override getNotFound as exception is raised after
  @test
  async getNotFound() {}

  @test
  async httpGetError() {
    // GET is not through classic binary
    // Skip it
  }

  @test
  async redirectUrl() {
    let { user1, ctx } = await this.setupDefault();
    // Making sure we are redirected on GET
    let executor = this.getExecutor(ctx, "test.webda.io", "GET", `/binary/users/${user1.getUuid()}/images/0`, {});
    await executor.execute(ctx);
    assert.ok(ctx.getResponseHeaders().Location !== undefined);
  }

  @test
  async redirectUrlInfo() {
    let { user1, ctx } = await this.setupDefault();
    // Making sure we are redirected on GET
    let executor = this.getExecutor(ctx, "test.webda.io", "GET", `/binary/users/${user1.getUuid()}/images/0/url`, {});
    await executor.execute(ctx);
    assert.ok(ctx.getResponseHeaders().Location === undefined);
    assert.notStrictEqual(JSON.parse(ctx.getResponseBody()).Location, undefined);
  }

  @test
  async cascadeDelete() {
    let stubDelete = sinon.stub(this.getBinary(), "_cleanUsage").callsFake(() => {
      throw new Error();
    });
    try {
      // @ts-ignore
      await this.getBinary().cascadeDelete({ hash: "pp" }, "pp");
    } finally {
      stubDelete.restore();
    }
  }

  @test
  async defaultGCS() {
    let { user1, ctx } = await this.setupDefault();
    // COV for double
    const binary = this.getBinary();
    const from = `${this.prefix}/rawAccess`;
    const to = `${this.prefix}/movedAccess`;
    await binary.putObject(from, path.join(__dirname, "..", "..", "test", "Dockerfile.txt"));
    await binary.moveObject({ key: from }, { key: to });
    assert.deepStrictEqual(binary.getSignedUrlHeaders(), {});
    const meta = await binary.getMeta({ bucket: "webda-dev", key: to });
    assert.deepStrictEqual(meta, { size: 311, contentType: "text/plain" });
    assert.ok(
      /https:\/\/storage\.googleapis\.com\/webda-dev\/webda-dev/.exec(await binary.getPublicUrl({ key: "webda-dev" }))
    );
    await binary.deleteObject({ key: to });
  }
}
