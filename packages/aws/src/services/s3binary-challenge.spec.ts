import { ListObjectsV2Command, PutObjectCommand, S3 } from "@aws-sdk/client-s3";
import { MemoryBinaryFile, MemoryRepository, registerRepository, User } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mockClient } from "aws-sdk-client-mock";
import { vi } from "vitest";
import { S3Binary, S3BinaryParameters } from "./s3binary.service.js";

const Bucket = "webda-unit";

/**
 * The challenge protocol of S3Binary against a mocked S3 client: an existing binary is attached only when the
 * client's challenge matches the stored one; a hash alone never attaches
 */
@suite
class S3BinaryChallengeTest extends WebdaApplicationTest {
  binary: S3Binary;
  /**
   * Keys present in the bucket
   */
  keys: string[] = [];
  /**
   * Markers written through putObject
   */
  written: string[] = [];
  mock: ReturnType<typeof mockClient>;

  async beforeEach() {
    await super.beforeEach();
    this.keys = [];
    this.written = [];
    this.mock = mockClient(S3);
    this.mock.on(ListObjectsV2Command).callsFake(async p => ({
      Contents: this.keys.filter(k => k.startsWith(p.Prefix ?? "")).map(Key => ({ Key }))
    }));
    this.mock.on(PutObjectCommand).callsFake(async p => {
      this.written.push(p.Key);
      this.keys.push(p.Key);
      return {};
    });
    registerRepository(User as any, new MemoryRepository(User as any, ["uuid"]) as any);
    this.binary = this.registerService(
      new S3Binary("binary", new S3BinaryParameters().load({ bucket: Bucket, region: "us-east-1" }))
    ).resolve();
    await this.binary.init();
    vi.spyOn(this.binary, "getSignedUrl").mockResolvedValue("https://signed.example/put");
  }

  async afterEach() {
    this.mock.restore();
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
    // The binary exists in the bucket with the challenge of its uploader
    this.keys.push(this.binary._getKey(file.hash), this.binary._getKey(file.hash, `proof_${file.challenge}`));
    // A reader copying the hash with a wrong challenge: an upload URL, nothing attached
    const attacker = await User.create({ uuid: "s3-attacker" } as any);
    const res = await this.binary.putRedirectUrl(attacker, "images", { ...info, challenge: "not-the-challenge" });
    assert.strictEqual(res?.method, "PUT");
    assert.strictEqual((attacker as any).images, undefined);
    assert.strictEqual(((await User.ref("s3-attacker").get()) as any).images, undefined);
    assert.deepStrictEqual(this.written, [], "no marker written for the attacker");
    // The matching challenge (proof of possession): attached, no upload
    const holder = await User.create({ uuid: "s3-holder" } as any);
    assert.strictEqual(await this.binary.putRedirectUrl(holder, "images", info), undefined);
    assert.strictEqual(((await User.ref("s3-holder").get()) as any).images.hash, file.hash);
  }

  @test
  async newContentAttachesAndAsksForTheUpload() {
    const { file, info } = await this.file("brand new");
    const user = await User.create({ uuid: "s3-new" } as any);
    const res = await this.binary.putRedirectUrl(user, "images", info);
    assert.strictEqual(res?.method, "PUT");
    assert.strictEqual(res.headers["Content-MD5"], Buffer.from(file.hash, "hex").toString("base64"));
    // The content is bound to the announced hash by Content-MD5 on the signed PUT
    assert.strictEqual(((await User.ref("s3-new").get()) as any).images.hash, file.hash);
    assert.ok(this.written.includes(this.binary._getKey(file.hash, `proof_${file.challenge}`)));
  }

  @test
  async legacyChallengeKeysAreNoProof() {
    const { file, info } = await this.file("legacy");
    // Stored before the fix: only a `challenge_` key, whose value every reader of the owner could see
    this.keys.push(this.binary._getKey(file.hash), this.binary._getKey(file.hash, `challenge_${file.challenge}`));
    const user = await User.create({ uuid: "s3-legacy" } as any);
    const res = await this.binary.putRedirectUrl(user, "images", info);
    assert.strictEqual(res?.method, "PUT", "an upload is required");
    assert.strictEqual(((await User.ref("s3-legacy").get()) as any).images, undefined);
  }
}
