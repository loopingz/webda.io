import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as sinon from "sinon";
import { CoreModel } from "../models/coremodel";
import { WebdaTest } from "../test";
import { Context } from "../utils/context";
import { Binary, BinaryEvents, BinaryFile, BinaryMap, BinaryMetadata, BinaryParameters } from "./binary";
import { BinaryTest } from "./binary.spec";
import { CloudBinary, CloudBinaryParameters } from "./cloudbinary";

class CloudBinaryFakeService extends CloudBinary {
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

export class CloudBinaryTest<
  T extends Binary<BinaryParameters, BinaryEvents> = Binary<BinaryParameters, BinaryEvents>
> extends BinaryTest<T> {
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
}

@suite
export class FakeCloudBinaryTest extends WebdaTest {
  binaryService;

  @test
  async testDefaults() {
    let service = new CloudBinaryFakeService(this.webda, "fake", {});
    let binaryMap: any = { hash: "test", size: 10 };

    await service.cascadeDelete(binaryMap, "plop");
    let stub = sinon.stub(service, "_cleanUsage").callsFake(() => {
      throw new Error();
    });
    // Should not fail even with exception
    await service.cascadeDelete(binaryMap, "plop");
    stub.restore();

    assert.strictEqual(service._getKey("hash"), "hash/data");
    service.getParameters().prefix = "prefix";
    assert.strictEqual(service._getKey("hash", "plop"), "prefix/hash/plop");

    assert.strictEqual(new CloudBinaryParameters({}, service).prefix, "");

    sinon.stub(service, "deleteSuccess").resolves();
    let model = new CoreModel();
    model.load({ plop: [{}, { hash: "fake" }] }, true);
    await service.delete(model, "plop", 1);
    // Check called with "fake", 1
  }

  @test
  async initRoutes() {
    let service = new CloudBinaryFakeService(this.webda, "fake", {});
    let counter = 0;
    // @ts-ignore addRoute is a protected method of service
    let stub = sinon.stub(service, "addRoute").callsFake(() => {
      counter++;
    });
    service.initRoutes();
    assert.strictEqual(counter, 0);
    service.getParameters().expose = {
      url: "plop",
      restrict: {}
    };
    service.initRoutes();
    assert.strictEqual(counter, 7);
    counter = 0;
    service.getParameters().expose = {
      url: "plop",
      restrict: {
        get: true
      }
    };
    service.initRoutes();
    assert.strictEqual(counter, 4);
  }

  @test
  async routes() {
    let service = new CloudBinaryFakeService(this.webda, "fake", {});
    let wrote;
    let wroteHead;
    let context: Context = <any>{
      parameter: name => {
        return name === "index" ? 1 : name;
      },
      write: (...arg) => {
        wrote = arg;
      },
      writeHead: (...arg) => {
        wroteHead = arg;
      }
    };
    let storeGetResult;
    // @ts-ignore
    sinon.stub(service, "_verifyMapAndStore").callsFake(() => {
      return {
        get: async () => {
          return storeGetResult;
        }
      };
    });
    await assert.rejects(() => service.getRedirectUrl(context), /404/);
    storeGetResult = {
      property: "plop"
    };
    await assert.rejects(() => service.getRedirectUrl(context), /404/);
    storeGetResult = {
      property: [1]
    };
    await assert.rejects(() => service.getRedirectUrl(context), /404/);
    let myEvt;
    storeGetResult = {
      property: [
        1,
        {
          hash: "myhash"
        }
      ],
      canAct: (ctx, evt) => {
        myEvt = evt;
      }
    };
    let counter = 0;
    service.on("Binary.Get", () => {
      counter++;
    });
    await service.getRedirectUrl(context);
    assert.deepStrictEqual(wroteHead, [302, { Location: "myhash:30" }]);
    await service.getRedirectUrlInfo(context);
    assert.strictEqual(counter, 2);
    assert.deepStrictEqual(wrote, [
      {
        Location: "myhash:30",
        Map: {
          hash: "myhash"
        }
      }
    ]);
    assert.strictEqual(myEvt, "get_binary");
  }
}
