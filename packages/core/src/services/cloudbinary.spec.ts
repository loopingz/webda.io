import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { CoreModel } from "../models/coremodel.js";
import { WebdaTest } from "../test/core.js";
import { BinaryFile, BinaryMap, BinaryMetadata, CoreModelWithBinary } from "./binary.js";
import { CloudBinary, CloudBinaryParameters } from "./cloudbinary.js";
import { MemoryRepository } from "@webda/models";
import { registerRepository } from "@webda/models";

class CloudBinaryFakeService extends CloudBinary {
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
  async _cleanUsage(hash: string, uuid: string): Promise<void> {}

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
export class FakeCloudBinaryTest extends WebdaTest {
  binaryService;

  @test
  async testDefaults() {
    const service = new CloudBinaryFakeService("fake", {});
    const binaryMap: any = { hash: "test", size: 10 };

    await service.cascadeDelete(binaryMap, "plop");
    const stub = sinon.stub(service, "_cleanUsage").callsFake(() => {
      throw new Error();
    });
    // Should not fail even with exception
    await service.cascadeDelete(binaryMap, "plop");
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
}
