import { Storage as GCS } from "@google-cloud/storage";
import { BinaryService, RESTDomainService } from "@webda/core";
import { suite, test } from "@webda/test";
import { getCommonJS } from "@webda/utils";
import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import { GCSFinder, Storage, StorageParameters } from "./storage";
const { __dirname } = getCommonJS(import.meta.url);

const BUCKET = "webda-dev";
@suite
class StorageTest extends BinaryTest<Storage> {
  prefix: string;
  apiEndpoint: string;
  async before() {
    this.apiEndpoint = process.env["GCS_API_ENDPOINT"] || "";
    await this.buildWebda();
    await this.install();
    await super.before();
  }

  getBinary(): Promise<Storage<StorageParameters>> {
    this.prefix = this.webda.getUuid();
    return this.addService(Storage, {
      bucket: "webda-dev",
      endpoint: this.apiEndpoint,
      prefix: this.prefix
    });
  }

  async after() {
    await this.cleanData();
  }

  async install() {
    const storage = new GCS({ apiEndpoint: this.apiEndpoint });
    try {
      const [exists] = await storage.bucket(BUCKET).exists();
      if (!exists) {
        console.log("INFO", `Google cloud storage creating bucket '${BUCKET}'`);
        await storage.createBucket(BUCKET, {
          location: "US-WEST2",
          storageClass: "COLDLINE"
        });
      } else {
        await this.cleanData();
      }
    } catch (e: any) {
      console.log("ERROR", `Google Cloud Storage error (${e.message})`);
    }
  }

  async cleanData() {
    const storage = new GCS({ apiEndpoint: this.apiEndpoint });
    try {
      const [files] = await storage.bucket(BUCKET).getFiles({
        prefix: this.prefix
      });
      for (const file of files) {
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
    await this.binary.putObject(name, Buffer.from(body), { meta1: "meta1" }, BUCKET);
    const getFile = this.binary.getStorageBucket().file(name);

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
    const { user1, ctx } = await this.setupDefault();
    await this.addService(RESTDomainService, {});
    // Making sure we are redirected on GET
    const executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      `${this.webda.getRouter().getModelUrl(user1)}/${user1.getUuid()}/images/0`,
      {}
    );
    await executor.execute(ctx);
    assert.ok(ctx.getResponseHeaders().Location !== undefined);
  }

  @test
  async redirectUrlInfo() {
    const { user1, ctx } = await this.setupDefault();
    await this.addService(RESTDomainService, {});
    // Making sure we are redirected on GET
    const executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      `${this.webda.getRouter().getModelUrl(user1)}/${user1.getUuid()}/images/0/url`,
      {}
    );
    await executor.execute(ctx);
    assert.ok(ctx.getResponseHeaders().Location === undefined);
    assert.notStrictEqual(JSON.parse(<string>ctx.getResponseBody()).Location, undefined);
  }

  @test
  async cascadeDelete() {
    const stubDelete = sinon.stub(await this.getBinary(), "_cleanUsage").callsFake(() => {
      throw new Error();
    });
    try {
      // @ts-ignore
      await (await this.getBinary()).cascadeDelete({ hash: "pp" }, "pp");
    } finally {
      stubDelete.restore();
    }
  }

  @test
  async defaultGCS() {
    const { user1, ctx } = await this.setupDefault();
    // COV for double
    const binary = await this.getBinary();
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
    const p = new Promise(resolve => {
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
    const url = await binary.getPublicUrl({ key: "webda-dev" });
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
    const metadata = {};
    Object.keys(info.headers)
      .filter(k => k.startsWith("x-goog-meta-"))
      .forEach(k => {
        metadata[k.substring(12)] = info.headers[k];
      });
    const file = new GCS({ apiEndpoint: this.apiEndpoint })
      .bucket(BUCKET)
      .file(url.pathname.substring(2 + BUCKET.length));
    await file.save(data);
    await file.setMetadata({ metadata: metadata });
  }

  @test
  async bucketSize() {
    const binary: Storage = await this.getBinary();
    sinon.stub(binary["storage"], "bucket").callsFake(() => {
      return <any>{
        getFiles: ({ pageToken }) => {
          const res = [];
          const offset = pageToken ? parseInt(pageToken) : 1;
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
