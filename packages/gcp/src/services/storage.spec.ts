import { Storage as GCS } from "@google-cloud/storage";
import { BinaryService, MemoryBinaryFile, useModel } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import { getCommonJS } from "@webda/utils";
import * as assert from "assert";
import { createHash, randomUUID } from "node:crypto";
import * as path from "node:path";
import { Readable } from "node:stream";
import { vi } from "vitest";
import { GCSFinder, Storage, StorageParameters } from "./storage.service.js";
const { __dirname } = getCommonJS(import.meta.url);

const BUCKET = "webda-dev";
const TEST_FILE = path.join(__dirname, "..", "..", "test", "Dockerfile.txt");

@suite
class StorageTest extends WebdaApplicationTest {
  prefix: string;
  apiEndpoint: string;
  binary: Storage;

  async beforeEach() {
    this.apiEndpoint = process.env["GCS_API_ENDPOINT"] || "";
    await super.beforeEach();
    const storage = new GCS({ apiEndpoint: this.apiEndpoint });
    const [exists] = await storage.bucket(BUCKET).exists();
    if (!exists) {
      await storage.createBucket(BUCKET);
    }
    this.prefix = randomUUID();
    this.binary = await this.registerService(
      new Storage(
        "binary",
        new StorageParameters().load({
          bucket: BUCKET,
          endpoint: this.apiEndpoint,
          prefix: this.prefix
        })
      )
    )
      .resolve()
      .init();
  }

  async afterEach() {
    vi.restoreAllMocks();
    const binary = this.binary;
    this.binary = undefined;
    await binary?.__clean();
  }

  /**
   * Create a file to store
   * @param content - the file content
   * @returns the memory binary file
   */
  getFile(content: string = `Binary ${randomUUID()}`): MemoryBinaryFile {
    const data = Buffer.from(content);
    return new MemoryBinaryFile(data, {
      mimetype: "text/plain",
      size: data.length,
      name: "test.txt",
      hash: createHash("md5").update(data).digest("hex"),
      challenge: createHash("md5")
        .update("WEBDA" + data)
        .digest("hex")
    });
  }

  @test
  params() {
    const params = new StorageParameters().load({ bucket: BUCKET });
    assert.strictEqual(params.prefix, "");
    assert.deepStrictEqual(params.models, { "*": ["*"] });
  }

  @test
  async putObject() {
    const body = `RAW Body: ${new Date()}`;
    const name = `${this.prefix}/plop/test`;
    await this.binary.putObject(name, Buffer.from(body), { meta1: "meta1" }, BUCKET);
    const getFile = this.binary.getStorageBucket().file(name);
    assert.deepStrictEqual((await getFile.getMetadata())[0].metadata, {
      meta1: "meta1"
    });
    // Readable body
    await this.binary.putObject(`${this.prefix}/plop/stream`, Readable.from([Buffer.from("stream")]));
    assert.strictEqual(
      (
        await BinaryService.streamToBuffer(await this.binary.getContent({ key: `${this.prefix}/plop/stream` }))
      ).toString(),
      "stream"
    );
  }

  @test
  async storeAndClean() {
    const User = useModel<any>("Webda/User");
    const user = await User.create({ uuid: randomUUID(), displayName: "plop" });
    const file = this.getFile();
    await this.binary.store(user, "images", file);
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 1);
    // Storing twice the same file does not upload it again
    const user2 = await User.create({ uuid: randomUUID(), displayName: "plop2" });
    await this.binary.store(
      user2,
      "images",
      this.getFile(await file.get().then(BinaryService.streamToBuffer).then(String))
    );
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 2);
    assert.strictEqual(
      (await BinaryService.streamToBuffer(await this.binary._get(<any>{ hash: file.hash }))).toString(),
      (await BinaryService.streamToBuffer(await file.get())).toString()
    );
    // The marker metadata reference the model
    const [marker] = await this.binary
      .getStorageBucket()
      .file(this.binary._getKey(file.hash, `images_${user.getUUID()}`))
      .getMetadata();
    assert.strictEqual(marker.metadata.webdaModel, "Webda/User");

    const url = await this.binary.getSignedUrlFromMap(<any>{ hash: file.hash }, 60, undefined);
    assert.ok(url.includes(this.binary._getKey(file.hash)));

    // Clean usage for one object keeps the data
    await this.binary._cleanUsage(file.hash, user.getUUID(), "images");
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 1);
    // Clean the last usage removes the data
    await this.binary.cascadeDelete(<any>{ hash: file.hash }, user2.getUUID());
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 0);
    const [exists] = await this.binary.getStorageBucket().file(this.binary._getKey(file.hash)).exists();
    assert.strictEqual(exists, false);
  }

  @test
  async putRedirectUrl() {
    const User = useModel<any>("Webda/User");
    const user = await User.create({ uuid: randomUUID(), displayName: "plop" });
    const file = this.getFile();
    const info = {
      hash: file.hash,
      challenge: file.challenge,
      size: file.size,
      name: file.name,
      mimetype: file.mimetype
    };
    const res = await this.binary.putRedirectUrl(user, "images", info);
    assert.strictEqual(res.method, "PUT");
    assert.strictEqual(res.headers["Content-MD5"], Buffer.from(file.hash, "hex").toString("base64"));
    assert.strictEqual(res.headers["x-goog-meta-proof"], file.challenge);
    assert.ok(res.url.includes(this.binary._getKey(file.hash)));
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 1);
    // Simulate the upload done by the client
    await this.binary.putObject(this.binary._getKey(file.hash), await file.get(), { proof: file.challenge });
    // Same challenge, no need to upload again
    const user2 = await User.create({ uuid: randomUUID(), displayName: "plop2" });
    assert.strictEqual(await this.binary.putRedirectUrl(user2, "images", info), undefined);
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 2);
    // Data exists but the challenge does not match (a reader copying the hash): nothing is attached
    const user3 = await User.create({ uuid: randomUUID(), displayName: "plop3" });
    const mismatch = await this.binary.putRedirectUrl(user3, "images", { ...info, challenge: "not-the-challenge" });
    assert.strictEqual(mismatch?.method, "PUT");
    assert.strictEqual((user3 as any).images, undefined, "nothing attached without the proof");
    assert.strictEqual((await User.ref(user3.getUUID()).get()).images, undefined);
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 2);
  }

  @test
  async cascadeDeleteError() {
    vi.spyOn(this.binary, "_cleanUsage").mockImplementation(async () => {
      throw new Error("Fake");
    });
    // Should not throw
    await this.binary.cascadeDelete(<any>{ hash: "pp" }, "pp");
  }

  @test
  async defaultGCS() {
    const binary = this.binary;
    const from = `${this.prefix}/rawAccess`;
    const to = `${this.prefix}/movedAccess`;
    await binary.putObject(from, TEST_FILE);
    // Test GCS finder
    const finder = new GCSFinder({ apiEndpoint: this.apiEndpoint });
    const processor = vi.fn();
    let files = await finder.find(`gs://${BUCKET}/`, { processor });
    assert.strictEqual(processor.mock.calls.length, files.length);
    assert.notStrictEqual(files.length, 0);
    files = await finder.find(`gs://${BUCKET}/${this.prefix}`, { filterPattern: /rawAccess$/, processor });
    assert.strictEqual(files.length, 1);
    const writer = await finder.getWriteStream(`gs://${BUCKET}/${this.prefix}/test.txt`);
    const p = new Promise(resolve => {
      writer.on("finish", resolve);
    });
    writer.end("test");
    await p;
    assert.strictEqual(
      (
        await BinaryService.streamToBuffer(await finder.getReadStream(`gs://${BUCKET}/${this.prefix}/test.txt`))
      ).toString(),
      "test"
    );
    assert.throws(() => finder.getInfo("s3://test/plop.txt"), /Invalid protocol path should be gs:/);

    await binary.moveObject({ key: from }, { key: to });
    assert.deepStrictEqual(binary.getSignedUrlHeaders(), {});
    const meta = await binary.getMeta({ bucket: BUCKET, key: to });
    assert.deepStrictEqual(meta, { size: 311, contentType: "text/plain" });
    const url = await binary.getPublicUrl({ key: BUCKET });
    assert.ok(/\/webda-dev\/webda-dev/.exec(url));
    await binary.deleteObject({ key: to });
    const [exists] = await binary.getStorageBucket().file(to).exists();
    assert.strictEqual(exists, false);
  }

  @test
  async bucketSize() {
    const binary = this.binary;
    vi.spyOn(binary["storage"], "bucket").mockImplementation(
      () =>
        <any>{
          getFiles: ({ pageToken }) => {
            const res = [];
            const offset = pageToken ? parseInt(pageToken) : 1;
            for (let i = offset; i < 100 + offset; i++) {
              res.push({ name: `a${i}`, getMetadata: async () => [{ size: pageToken ? "20" : "100" }] });
            }
            return [res, pageToken ? { pageToken: "" } : { pageToken: "666" }];
          }
        }
    );
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
