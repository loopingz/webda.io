import { BinaryTest } from "@webda/core/lib/services/binary.spec";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { Storage } from "./storage";
import * as sinon from "sinon";
import { Binary } from "@webda/core";
import { Storage as GCS, GetSignedUrlConfig } from "@google-cloud/storage";

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
      if (!metadata){
        await storage.createBucket(BUCKET, { location: 'US-WEST2', storageClass: 'COLDLINE' });
        await storage.bucket(BUCKET).getMetadata();
      }
      //this.webda.log("INFO", `Google cloud storage bucket '${BUCKET}' exists`);
    } catch (e:any){
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
    let put = await this.getBinary().putObject("plop/test", body, { meta1: "meta1" }, BUCKET);

    //@ts-expect-error force call storage
    let get= await this.getBinary().storage.getObject("plop/test", body, { meta1: "meta1" }, BUCKET);

    assert.strictEqual(put, {});
    assert.strictEqual(get, {});
  }
}
