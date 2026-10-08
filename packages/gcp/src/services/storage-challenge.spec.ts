import { MemoryBinaryFile, MemoryRepository, registerRepository, User } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { Storage, StorageParameters } from "./storage.service.js";

const BUCKET = "webda-unit";

/**
 * The challenge protocol of the GCS Storage against a mocked bucket: an existing binary is attached only when the
 * client's challenge matches the stored one; a hash alone never attaches
 */
@suite
class StorageChallengeTest extends WebdaApplicationTest {
  binary: Storage;
  /**
   * Objects in the bucket: key -> metadata
   */
  objects: Map<string, any> = new Map();
  /**
   * Markers saved
   */
  saved: string[] = [];

  async beforeEach() {
    await super.beforeEach();
    this.objects = new Map();
    this.saved = [];
    registerRepository(User as any, new MemoryRepository(User as any, ["uuid"]) as any);
    this.binary = this.registerService(
      new Storage("binary", new StorageParameters().load({ bucket: BUCKET, prefix: "unit" }))
    ).resolve();
    await this.binary.init();
    vi.spyOn(this.binary, "getStorageBucket").mockImplementation(
      () =>
        <any>{
          file: (key: string) => ({
            getMetadata: async () => {
              if (!this.objects.has(key)) {
                throw new Error("No such object");
              }
              return [{ metadata: this.objects.get(key) }];
            },
            save: async (_content: string, options: any) => {
              this.saved.push(key);
              this.objects.set(key, options?.metadata?.metadata ?? {});
            },
            getSignedUrl: async () => ["https://signed.example/put"]
          })
        }
    );
  }

  async afterEach() {
    vi.restoreAllMocks();
    await super.afterEach();
  }

  /**
   * @returns a file with its hashes and the info a client would announce
   */
  async file(content: string = "unit content") {
    const file = new MemoryBinaryFile(Buffer.from(content), { name: "u.txt" });
    await file.getHashes();
    return { file, info: file.toBinaryFileInfo() };
  }

  @test
  async existingDataNeedsTheMatchingChallenge() {
    const { file, info } = await this.file();
    // The binary exists with the challenge its uploader sent as metadata
    this.objects.set(this.binary._getKey(file.hash, "data"), { proof: file.challenge });
    // A reader copying the hash with a wrong challenge: an upload URL, nothing attached
    const attacker = await User.create({ uuid: "gcs-attacker" } as any);
    const res = await this.binary.putRedirectUrl(attacker, "images", {
      ...info,
      challenge: "not-the-challenge"
    } as any);
    assert.strictEqual(res?.method, "PUT");
    assert.strictEqual((attacker as any).images, undefined);
    assert.strictEqual(((await User.ref("gcs-attacker").get()) as any).images, undefined);
    assert.deepStrictEqual(this.saved, [], "no marker saved for the attacker");
    // The matching challenge (proof of possession): attached, no upload
    const holder = await User.create({ uuid: "gcs-holder" } as any);
    assert.strictEqual(await this.binary.putRedirectUrl(holder, "images", info as any), undefined);
    assert.strictEqual(((await User.ref("gcs-holder").get()) as any).images.hash, file.hash);
    assert.deepStrictEqual(this.saved, [this.binary._getKey(file.hash, "images_gcs-holder")]);
  }

  @test
  async legacyChallengeMetadataIsNoProof() {
    const { file, info } = await this.file("legacy");
    // Stored before the fix: a `challenge` metadata whose value every reader of the owner could see
    this.objects.set(this.binary._getKey(file.hash, "data"), { challenge: file.challenge });
    const user = await User.create({ uuid: "gcs-legacy" } as any);
    const res = await this.binary.putRedirectUrl(user, "images", info as any);
    assert.strictEqual(res?.method, "PUT", "an upload is required");
    assert.strictEqual(((await User.ref("gcs-legacy").get()) as any).images, undefined);
  }

  @test
  async newContentAttachesAndAsksForTheUpload() {
    const { file, info } = await this.file("brand new");
    const user = await User.create({ uuid: "gcs-new" } as any);
    const res = await this.binary.putRedirectUrl(user, "images", info as any);
    assert.strictEqual(res?.method, "PUT");
    assert.strictEqual(res.headers["Content-MD5"], Buffer.from(file.hash, "hex").toString("base64"));
    assert.strictEqual(res.headers["x-goog-meta-proof"], file.challenge);
    // The content is bound to the announced hash by Content-MD5 on the signed PUT
    assert.strictEqual(((await User.ref("gcs-new").get()) as any).images.hash, file.hash);
  }
}
