import { KeyManagementServiceClient } from "@google-cloud/kms";
import { suite, test } from "@testdeck/mocha";
import { WebdaSimpleTest } from "@webda/core/lib/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { GCPKMSService } from "./kms";

@suite
class KMSTest extends WebdaSimpleTest {
  @test
  async test() {
    sinon.stub(KeyManagementServiceClient.prototype, "encrypt").callsFake(() => {
      return [
        {
          ciphertext: "ciphertext"
        }
      ];
    });
    sinon.stub(KeyManagementServiceClient.prototype, "decrypt").callsFake(() => {
      return [
        {
          plaintext: "plaintext"
        }
      ];
    });
    const service = await this.registerService(
      new GCPKMSService(this.webda, "KMSService", {
        defaultKey: "projects/my-project/locations/us-east1/keyRings/my-key-ring/cryptoKeys/my-key"
      })
    )
      .resolve()
      .init();
    const encoded = await service.encrypt("test");
    assert.deepStrictEqual(Buffer.from(encoded.split(":")[0], "base64").toString().split(":"), [
      "my-project",
      "us-east1",
      "my-key-ring",
      "my-key"
    ]);
    assert.strictEqual(encoded.split(":").pop(), "Y2lwaGVydGV4dA==");
    const decoded = await service.decrypt(encoded);
    assert.strictEqual(decoded, "plaintext");
    assert.rejects(() => service.decrypt(Buffer.from("test:plop").toString("base64") + ":test"));
  }
}
