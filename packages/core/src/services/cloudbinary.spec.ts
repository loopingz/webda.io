import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { CoreModel } from "../models/coremodel.model.js";
import { WebdaApplicationTest } from "../test/index.js";
import { BinaryFile, BinaryMap, BinaryMetadata, CoreModelWithBinary } from "./binary.service.js";
import { CloudBinary, CloudBinaryParameters } from "./cloudbinary.js";
import { MemoryRepository } from "@webda/models";
import { registerRepository } from "@webda/models";
import { ContentStorages } from "@webda/utils";
import { Readable } from "node:stream";

class CloudBinaryFakeService extends CloudBinary {
  readonly schemes = ["fake"];
  async getContent(): Promise<Readable> {
    return Readable.from([]);
  }
  async putContent(url: string) {
    return { url };
  }
  contentUrl(key: string): string {
    return this.getContentUrl(key);
  }
  static createConfiguration?: (params: any) => any = (params: any) => {
    return new CloudBinaryParameters().load(params);
  };
  store(object: CoreModel, property: string, file: BinaryFile, metadata?: BinaryMetadata): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getUsageCount(hash: string): Promise<number> {
    throw new Error("Method not implemented.");
  }
  /**
   * Clean usage for a hash
   */
  async _cleanUsage(hash: string, uuid: string, attribute: string, model?: string): Promise<void> {}

  /**
   * Return undefined
   * @returns
   */
  // @ts-ignore
  async _get() {
    return undefined;
  }

  /**
   * Retrieve one signed URL to download the file in parameter
   * @param {GetSignedUrlParams} params
   * @returns {string} URL in order to download the file
   */
  async getSignedUrlFromMap(map: BinaryMap, expires: number): Promise<string> {
    return `${map.hash}:${expires}`;
  }
}

@suite
export class FakeCloudBinaryTest extends WebdaApplicationTest {
  binaryService;

  @test
  async testDefaults() {
    const service = new CloudBinaryFakeService("fake", {});
    const binaryMap: any = { hash: "test", size: 10 };

    const spy = sinon.spy(service, "_cleanUsage");
    await service.cascadeDelete(binaryMap, "plop", "images", "Test/Model");
    // The exact usage of the deleted owner: hash, uuid, attribute and model
    assert.deepStrictEqual(spy.getCall(0).args, ["test", "plop", "images", "Test/Model"]);
    spy.restore();
    const stub = sinon.stub(service, "_cleanUsage").callsFake(() => {
      throw new Error();
    });
    // Should not fail even with exception
    await service.cascadeDelete(binaryMap, "plop", "images", "Test/Model");
    stub.restore();

    assert.strictEqual(service._getKey("hash"), "hash/data");
    service.getParameters().prefix = "prefix";
    assert.strictEqual(service._getKey("hash", "plop"), "prefix/hash/plop");

    assert.strictEqual(new CloudBinaryParameters().load({}).prefix, "");

    sinon.stub(service, "deleteSuccess").resolves();
    const model = new CoreModel();
    registerRepository(CoreModel, new MemoryRepository(CoreModel, ["uuid"]));
    model.load({ plop: [{}, { hash: "fake" }] });
    await service.delete(<CoreModelWithBinary>model, "plop", 1);
    // Check called with "fake", 1
  }

  @test
  async contentStorageRegistrationLifecycle() {
    const params = new CloudBinaryParameters().load({ bucket: "example", contentStorage: { default: true } });
    const service = this.registerService(new CloudBinaryFakeService("content-fake", params)).resolve();
    assert.strictEqual(service.getContentBucket(), "example");
    assert.strictEqual(service.contentUrl("/some/key"), "fake://example/some/key");
    await service.init();
    assert.strictEqual(ContentStorages.resolve("fake://example/key"), service);
    await service.stop();
    assert.throws(() => ContentStorages.resolve("fake://example/key"));
  }

  @test
  async contentUrlWithoutBucketAndOptedOutRegistration() {
    const params = new CloudBinaryParameters().load({ contentStorage: { register: false } });
    const service = this.registerService(new CloudBinaryFakeService("unregistered-fake", params)).resolve();
    assert.strictEqual(service.contentUrl("/some/key"), "fake:/some/key");
    service.schemes.splice(0);
    assert.strictEqual(service.contentUrl("key"), "s3:/key");
    await service.init();
    assert.throws(() => ContentStorages.resolve("fake:/key"));
    await service.stop();
  }
}
