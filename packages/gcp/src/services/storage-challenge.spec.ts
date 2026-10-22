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
    assert.deepStrictEqual(this.saved, [this.binary._getKey(file.hash, "@Webda~2FUser_images_gcs-holder")]);
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

  /**
   * Mock a bucket listing for the usage cleanup
   * @param markers - the marker names under the hash, with their `webdaModel` metadata
   * @param hash - the binary hash
   * @returns the keys removed
   */
  listed(hash: string, markers: Record<string, string | undefined>): string[] {
    const deleted: string[] = [];
    const keys = [this.binary._getKey(hash, "data"), ...Object.keys(markers).map(m => this.binary._getKey(hash, m))];
    vi.spyOn(this.binary, "getStorageBucket").mockImplementation(
      () =>
        <any>{
          getFiles: async ({ prefix }) => [
            keys
              .filter(name => name.startsWith(prefix) && !deleted.includes(name))
              .map(name => ({
                name,
                getMetadata: async () => [{ metadata: { webdaModel: markers[name.split("/").pop()] } }],
                delete: async () => {
                  deleted.push(name);
                }
              }))
          ]
        }
    );
    return deleted;
  }

  /**
   * A legacy `<attribute>_<uuid>` marker is shared by every model with this uuid: removed only with its own model
   */
  @test
  async cleanUsageRemovesTheLegacyMarkerOfItsModelOnly() {
    const hash = "0123456789abcdef0123456789abcdef";
    let deleted = this.listed(hash, { "@Webda~2FPage_files_page": "Webda/Page", files_page: "Webda/Other" });
    await this.binary._cleanUsage(hash, "page", "files", "Webda/Page");
    assert.deepStrictEqual(deleted, [this.binary._getKey(hash, "@Webda~2FPage_files_page")]);
    deleted = this.listed(hash, { files_page: "Webda/Page" });
    await this.binary._cleanUsage(hash, "page", "files", "Webda/Page");
    assert.deepStrictEqual(deleted, [this.binary._getKey(hash, "files_page"), this.binary._getKey(hash, "data")]);
    // No legacy marker: the model marker and the unused data are removed
    deleted = this.listed(hash, { "@Webda~2FPage_files_page": "Webda/Page" });
    await this.binary._cleanUsage(hash, "page", "files", "Webda/Page");
    assert.deepStrictEqual(deleted, [
      this.binary._getKey(hash, "@Webda~2FPage_files_page"),
      this.binary._getKey(hash, "data")
    ]);
  }

  /**
   * Without the attribute or the model the exact marker is unknown: nothing is removed
   */
  @test
  async cleanUsageWithoutAttributeOrModelKeepsMarkers() {
    const hash = "0123456789abcdef0123456789abcdef";
    const deleted = this.listed(hash, { files_page: "Webda/Page" });
    const log = vi.spyOn(this.binary, "log");
    await this.binary._cleanUsage(hash, "page", undefined as any, "Webda/Page");
    await this.binary._cleanUsage(hash, "page", "files", undefined as any);
    assert.deepStrictEqual(deleted, []);
    assert.strictEqual(log.mock.calls.filter(c => c[0] === "WARN").length, 2);
  }
}
