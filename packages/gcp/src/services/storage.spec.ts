import { Storage as GCS } from "@google-cloud/storage";
import { suite, test } from "@testdeck/mocha";
import { BinaryService, FileUtils, getCommonJS } from "@webda/core";
import { BinaryTest } from "@webda/core/lib/services/binary.spec";
import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import { GCSFinder, Storage } from "./storage";
import { readFileSync } from "fs";
const { __dirname } = getCommonJS(import.meta.url);

const BUCKET = "webda-dev";
@suite
class StorageTest extends BinaryTest<Storage> {
  prefix: string;
  apiEndpoint: string;
  async before() {
    this.apiEndpoint = process.env["GCS_API_ENDPOINT"] || "";
    this.buildWebda();
    await this.install();
    await super.before();
    this.prefix = this.getBinary().getWebda().getUuid();
    this.getBinary().getParameters().prefix = this.prefix;
    this.getBinary().getParameters().endpoint = this.apiEndpoint;
  }

  async after() {
    await this.cleanData();
  }

  async install() {
    var storage = new GCS({ apiEndpoint: this.apiEndpoint });
    try {
      let [exists] = await storage.bucket(BUCKET).exists();
      if (!exists) {
        console.log("INFO", `Google cloud storage creating bucket '${BUCKET}'`);
        await storage.createBucket(BUCKET, {
          location: "US-WEST2",
          storageClass: "COLDLINE"
        });
      }
    } catch (e: any) {
      console.log("ERROR", `Google Cloud Storage error (${e.message})`);
    }
  }

  async cleanData() {
    var storage = new GCS({ apiEndpoint: this.apiEndpoint });
    try {
      const [files] = await storage.bucket(BUCKET).getFiles({
        prefix: this.prefix
      });
      for (let file of files) {
        await file.delete();
      }
    } catch (err) {
      console.error("Error cleaning up", err);
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

    assert.deepStrictEqual((await getFile.getMetadata())[0].metadata, {
      meta1: "meta1"
    });
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
  async challenge() {
    await this.testChallenge(false);
  }

  @test
  async redirectUrlInfo() {
    let { user1, ctx } = await this.setupDefault();
    // Making sure we are redirected on GET
    let executor = this.getExecutor(ctx, "test.webda.io", "GET", `/binary/users/${user1.getUuid()}/images/0/url`, {});
    await executor.execute(ctx);
    assert.ok(ctx.getResponseHeaders().Location === undefined);
    assert.notStrictEqual(JSON.parse(<string>ctx.getResponseBody()).Location, undefined);
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
    // Test GCS
    const finder = new GCSFinder({ apiEndpoint: this.apiEndpoint });
    const stub = sinon.stub();
    let files = await finder.find("gs://webda-dev/", { processor: stub });
    assert.strictEqual(stub.callCount, files.length);
    assert.notStrictEqual(files.length, 0);
    files = await finder.find(`gs://webda-dev/${this.prefix}`, { filterPattern: /rawAccess$/, processor: stub });
    assert.strictEqual(files.length, 1);
    const writer = await finder.getWriteStream(`gs://webda-dev/${this.prefix}/test.txt`);
    writer.write("test");
    let p = new Promise(resolve => {
      writer.on("finish", resolve);
    });
    writer.end();
    await p;
    assert.strictEqual(
      (
        await BinaryService.streamToBuffer(await finder.getReadStream(`gs://webda-dev/${this.prefix}/test.txt`))
      ).toString(),
      "test"
    );

    assert.throws(() => finder.getInfo("s3://test/plop.txt"), /Invalid protocol path should be gs:/);
    //
    await binary.moveObject({ key: from }, { key: to });
    assert.deepStrictEqual(binary.getSignedUrlHeaders(), {});
    const meta = await binary.getMeta({ bucket: "webda-dev", key: to });
    assert.deepStrictEqual(meta, { size: 311, contentType: "text/plain" });
    let url = await binary.getPublicUrl({ key: "webda-dev" });
    assert.ok(/\/webda-dev\/webda-dev/.exec(url));
    if (this.apiEndpoint) {
      assert.ok(url.startsWith(this.apiEndpoint));
    } else {
      assert.ok(url.startsWith("https://storage.googleapis.com"));
    }
    await binary.deleteObject({ key: to });
  }

  /**
   * Overwrite the send challenge data to use GCS
   * @param info
   * @param data
   */
  async sendChallengeData(info: any, data: string): Promise<any> {
    const url = new URL(info.url);
    let metadata = {};
    Object.keys(info.headers)
      .filter(k => k.startsWith("x-goog-meta-"))
      .forEach(k => {
        metadata[k.substring(12)] = info.headers[k];
      });
    let file = new GCS({ apiEndpoint: this.apiEndpoint })
      .bucket(BUCKET)
      .file(url.pathname.substring(2 + BUCKET.length));
    await file.save(data);
    await file.setMetadata({ metadata: metadata });
  }

  @test
  async bucketSize() {
    const binary: Storage = this.getBinary();
    sinon.stub(binary["storage"], "bucket").callsFake(() => {
      return <any>{
        getFiles: ({ pageToken }) => {
          let res = [];
          let offset = pageToken ? parseInt(pageToken) : 1;
          for (let i = offset; i < 100 + offset; i++) {
            res.push({ name: `a${i}`, getMetadata: async () => [{ size: pageToken ? "20" : "100" }] });
          }
          return [res, pageToken ? { pageToken: "" } : { pageToken: "666" }];
        }
      };
    });
    assert.deepStrictEqual(await binary.getBucketSize(), {
      size: 12000,
      count: 200
    });
    assert.deepStrictEqual(await binary.getBucketSize("plop", undefined, /a1/), {
      size: 1200,
      count: 12
    });
  }
}
