import { KeyManagementServiceClient } from "@google-cloud/kms";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { GCPKMSService, KMSServiceParameters } from "./kms.service.js";

@suite
class KMSTest extends WebdaApplicationTest {
  async afterEach() {
    vi.restoreAllMocks();
  }

  @test
  async params() {
    process.env.WEBDA_GCP_KMS_KEY = "projects/env/locations/l/keyRings/r/cryptoKeys/k";
    try {
      assert.strictEqual(new KMSServiceParameters().load().defaultKey, process.env.WEBDA_GCP_KMS_KEY);
      assert.strictEqual(new KMSServiceParameters().load({ defaultKey: "other" }).defaultKey, "other");
    } finally {
      delete process.env.WEBDA_GCP_KMS_KEY;
    }
  }

  @test
  async test() {
    vi.spyOn(KeyManagementServiceClient.prototype, "encrypt").mockImplementation(<any>(async () => [
      {
        ciphertext: "ciphertext"
      }
    ]));
    vi.spyOn(KeyManagementServiceClient.prototype, "decrypt").mockImplementation(<any>(async () => [
      {
        plaintext: Buffer.from("plaintext")
      }
    ]));
    const service = await this.registerService(
      new GCPKMSService(
        "KMSService",
        new KMSServiceParameters().load({
          defaultKey: "projects/my-project/locations/us-east1/keyRings/my-key-ring/cryptoKeys/my-key"
        })
      )
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
    await assert.rejects(
      () => service.decrypt(Buffer.from("test:plop").toString("base64") + ":test"),
      /Invalid KMS encryption/
    );
  }
}
