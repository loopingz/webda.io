import { BinaryTest } from "@webda/core/lib/services/binary.spec";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { Storage } from "./storage";
import * as sinon from "sinon";
import { Binary } from "@webda/core";
import { Storage as GCS, GetSignedUrlConfig } from "@google-cloud/storage";
import path from "path";

const BUCKET = "webda-dev";
@suite
class StorageTest extends BinaryTest<Storage> {
  async before() {
    this.buildWebda();
    await this.install();
    await this.cleanData();
    await super.before();
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
    await storage.bucket(BUCKET).deleteFiles();
  }

  // Override getNotFound as exception is raised after
  // @test
  // async getNotFound() {}

  @test
  async putObject() {
    const body = `RAW Body: ${new Date()}`;
    await this.getBinary().putObject("plop/test", Buffer.from(body), { meta1: "meta1" }, BUCKET);
    let getFile = this.getBinary().getStorageBucket().file("plop/test");

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
    await binary.putObject("rawAccess", path.join(__dirname, "..", "..", "test", "Dockerfile.txt"));
    await binary.moveObject({ key: "rawAccess" }, { key: "movedAccess" });
    assert.deepStrictEqual(binary.getSignedUrlHeaders(), {});
    const meta = await binary.getMeta({ bucket: "webda-dev", key: "movedAccess" });
    assert.deepStrictEqual(meta, { size: 311, contentType: "text/plain" });
    assert.ok(
      /https:\/\/storage\.googleapis\.com\/webda-dev\/webda-dev/.exec(await binary.getPublicUrl({ key: "webda-dev" }))
    );
    await binary.deleteObject({ key: "movedAccess" });
  }
}
