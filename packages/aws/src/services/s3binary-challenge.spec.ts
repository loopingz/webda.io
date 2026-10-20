import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3
} from "@aws-sdk/client-s3";
import { Binaries, MemoryBinaryFile, MemoryRepository, registerRepository, User } from "@webda/core";
import { TestApplication, WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mockClient } from "aws-sdk-client-mock";
import { vi } from "vitest";
import { contentDisposition, S3Binary, S3BinaryParameters } from "./s3binary.service.js";

const Bucket = "webda-unit";

/**
 * A user with a binary collection
 */
class ImageUser extends User {
  images: Binaries;
}

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
  /**
   * Keys removed through deleteObject
   */
  deleted: string[] = [];
  /**
   * Object metadata (S3 user metadata) and size, by key
   */
  objects: Map<string, { Metadata?: Record<string, string>; ContentLength?: number }> = new Map();
  /**
   * Binary.UploadSuccess events received
   */
  uploadEvents: any[] = [];
  mock: ReturnType<typeof mockClient>;

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.addModel("WebdaDemo/ImageUser", ImageUser, {
      Identifier: "WebdaDemo/ImageUser",
      Ancestors: [],
      Subclasses: [],
      Relations: { behaviors: [{ attribute: "images", behavior: "Webda/BinariesImpl" }] },
      PrimaryKey: ["uuid"],
      Events: [],
      Schemas: {},
      Actions: {},
      Import: "",
      Plural: "ImageUsers",
      Reflection: {}
    } as any);
    ImageUser.registerSerializer(true, "WebdaDemo/ImageUser");
  }

  async beforeEach() {
    await super.beforeEach();
    this.keys = [];
    this.written = [];
    this.deleted = [];
    this.objects = new Map();
    this.uploadEvents = [];
    this.mock = mockClient(S3);
    const list = async p => ({
      Contents: this.keys.filter(k => k.startsWith(p.Prefix ?? "")).map(Key => ({ Key }))
    });
    this.mock.on(ListObjectsV2Command).callsFake(list);
    this.mock.on(ListObjectsCommand).callsFake(list);
    this.mock.on(PutObjectCommand).callsFake(async p => {
      this.written.push(p.Key);
      this.keys.push(p.Key);
      this.objects.set(p.Key, { Metadata: p.Metadata, ContentLength: 0 });
      return {};
    });
    this.mock.on(HeadObjectCommand).callsFake(async p => {
      if (!this.keys.includes(p.Key)) {
        throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
      }
      return { ContentLength: 0, Metadata: {}, ...this.objects.get(p.Key) };
    });
    this.mock.on(DeleteObjectCommand).callsFake(async p => {
      this.deleted.push(p.Key);
      this.keys = this.keys.filter(k => k !== p.Key);
      return {};
    });
    registerRepository(User as any, new MemoryRepository(User as any, ["uuid"]) as any);
    registerRepository(ImageUser as any, new MemoryRepository(ImageUser as any, ["uuid"]) as any);
    this.binary = this.registerService(
      new S3Binary("binary", new S3BinaryParameters().load({ bucket: Bucket, region: "us-east-1" }))
    ).resolve();
    await this.binary.init();
    vi.spyOn(this.binary, "getSignedUrl").mockResolvedValue("https://signed.example/put");
    this.binary.on("Binary.UploadSuccess", evt => {
      this.uploadEvents.push(evt);
    });
  }

  /**
   * Simulate the client's PUT to the signed url: the data object exists with this size
   * @param hash - the binary hash
   * @param size - the object size
   */
  uploaded(hash: string, size: number) {
    const key = this.binary._getKey(hash);
    this.keys.push(key);
    this.objects.set(key, { ContentLength: size });
  }

  /**
   * @param uuid - the user uuid
   * @returns the stored images
   */
  async images(uuid: string): Promise<any[]> {
    return [...(((await ImageUser.ref(uuid).get()) as any).images ?? [])];
  }

  /**
   * A user with a pending upload of new content
   * @param content - the content
   * @param info - overrides of the announced info
   * @returns the user, the file and its info
   */
  async pending(content: string = "hello", info: any = {}) {
    const { file, info: announced } = await this.file(content);
    const user = await ImageUser.create({ uuid: `s3-${Math.random().toString(36).slice(2)}` } as any);
    const body = { ...announced, size: content.length, name: "a.png", mimetype: "image/png", ...info };
    const res = await this.binary.putRedirectUrl(user, "images", body);
    assert.strictEqual(res?.method, "PUT");
    return { user, file, info: body, res };
  }

  /**
   * #670: the download url carries the file name in Content-Disposition, quotes and accents must not break it
   */
  @test
  async contentDispositionFileName() {
    assert.strictEqual(contentDisposition(undefined), "attachment");
    assert.strictEqual(contentDisposition("plain.txt"), `attachment; filename="plain.txt"; filename*=UTF-8''plain.txt`);
    assert.strictEqual(
      contentDisposition(`l'été "1"; x=\\.png`, "inline"),
      `inline; filename="l'_t_ _1_; x=_.png"; filename*=UTF-8''l%27%C3%A9t%C3%A9%20%221%22%3B%20x%3D%5C.png`
    );
    await this.binary.getSignedUrlFromMap(
      { hash: "h", name: "l'été.png", mimetype: "image/png" } as any,
      30,
      undefined as any
    );
    const params = (this.binary.getSignedUrl as any).mock.calls.at(-1)[2];
    assert.strictEqual(
      params.ResponseContentDisposition,
      `attachment; filename="l'_t_.png"; filename*=UTF-8''l%27%C3%A9t%C3%A9.png`
    );
    assert.strictEqual(params.ResponseContentType, "image/png");
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
  async newContentIsPendingUntilComplete() {
    const { user, file, res } = await this.pending("hello");
    assert.ok(res.url);
    assert.strictEqual(res.headers["Content-MD5"], Buffer.from(file.hash, "hex").toString("base64"));
    // Browsers set Content-Length themselves
    assert.strictEqual(res.headers["Content-Length"], undefined);
    assert.strictEqual(JSON.stringify(res).includes(file.challenge), false, "the challenge is never returned");
    assert.deepStrictEqual(await this.images(user.getUUID()), [], "nothing attached");
    assert.strictEqual(this.uploadEvents.length, 0);
    const pendingKeys = this.written.filter(k => k.includes(`_pending/${file.hash}/`));
    assert.strictEqual(pendingKeys.length, 1);
    assert.ok(pendingKeys[0].endsWith(`WebdaDemo-ImageUser_images_${user.getUUID()}`), pendingKeys[0]);
    assert.ok(!pendingKeys[0].includes(file.challenge));
    assert.ok(!this.written.some(k => k.endsWith(`proof_${file.challenge}`)), "proof only after verification");
    assert.ok(!this.written.some(k => k.endsWith(`images_${user.getUUID()}`) && !k.includes("_pending/")));
    // The marker carries what completion needs, server side only
    const meta = this.objects.get(pendingKeys[0]).Metadata;
    assert.strictEqual(meta.challenge, file.challenge);
    assert.strictEqual(meta.size, "5");
    assert.ok(Math.abs(Date.now() - parseInt(meta.created)) < 10000);
    // Signed with the size
    const params = (this.binary.getSignedUrl as any).mock.calls.at(-1)[2];
    assert.strictEqual(params.ContentLength, 5);
  }

  @test
  async noDeclaredSizeIsNotSigned() {
    const { user, file } = await this.pending("hello", { size: undefined });
    const params = (this.binary.getSignedUrl as any).mock.calls.at(-1)[2];
    assert.strictEqual(params.ContentLength, undefined);
    // Any size completes without a declared one (and no limit)
    this.uploaded(file.hash, 9);
    await this.binary.completeUpload(user, "images", file.hash);
    assert.strictEqual((await this.images(user.getUUID()))[0].size, 9);
  }

  @test
  async completeAttachesAfterHead() {
    const { user, file } = await this.pending("hello", { name: "l'été.png", metadata: { title: "été" } });
    this.uploaded(file.hash, 5);
    await this.binary.completeUpload(user, "images", file.hash);
    const images = await this.images(user.getUUID());
    assert.strictEqual(images.length, 1);
    assert.strictEqual(images[0].hash, file.hash);
    assert.strictEqual(images[0].name, "l'été.png");
    assert.strictEqual(images[0].size, 5);
    assert.strictEqual(images[0].mimetype, "image/png");
    assert.deepStrictEqual({ ...images[0].metadata }, { title: "été" });
    assert.strictEqual(images[0].challenge, undefined, "the challenge is never persisted");
    assert.strictEqual(user.images[0].hash, file.hash);
    assert.ok(this.written.some(k => k.endsWith(`proof_${file.challenge}`)));
    assert.ok(this.written.some(k => k.endsWith(`images_${user.getUUID()}`) && !k.includes("_pending/")));
    assert.ok(this.deleted.some(k => k.includes(`_pending/${file.hash}/`)));
    assert.ok(!this.keys.some(k => k.includes("_pending/")));
    assert.strictEqual(this.uploadEvents.length, 1);
    // The new holder now dedupes for others
    const other = await ImageUser.create({ uuid: "s3-other" } as any);
    assert.strictEqual(
      await this.binary.putRedirectUrl(other, "images", { ...file.toBinaryFileInfo(), size: 5 } as any),
      undefined
    );
  }

  @test
  async completeWithoutUpload() {
    const { user, file } = await this.pending("hello");
    await assert.rejects(
      () => this.binary.completeUpload(user, "images", file.hash),
      (e: any) => e.getResponseCode() === 412
    );
    assert.ok(!this.deleted.some(k => k.includes("_pending/")), "retry possible");
    assert.deepStrictEqual(await this.images(user.getUUID()), []);
    // Uploaded afterwards: the retry attaches
    this.uploaded(file.hash, 5);
    await this.binary.completeUpload(user, "images", file.hash);
    assert.strictEqual((await this.images(user.getUUID())).length, 1);
  }

  @test
  async completeSizeMismatch() {
    const { user, file } = await this.pending("hello");
    this.uploaded(file.hash, 6);
    await assert.rejects(
      () => this.binary.completeUpload(user, "images", file.hash),
      (e: any) => e.getResponseCode() === 400
    );
    assert.ok(
      this.deleted.some(k => k.endsWith(`${file.hash}/data`)),
      "unused data removed"
    );
    assert.ok(this.deleted.some(k => k.includes(`_pending/${file.hash}/`)));
    assert.ok(!this.written.some(k => k.endsWith(`proof_${file.challenge}`)));
    assert.deepStrictEqual(await this.images(user.getUUID()), []);
    assert.strictEqual(this.uploadEvents.length, 0);
  }

  @test
  async completeSizeMismatchKeepsUsedData() {
    const { user, file } = await this.pending("hello");
    this.uploaded(file.hash, 6);
    // Another object uses the data
    this.keys.push(this.binary._getKey(file.hash, "WebdaDemo-ImageUser_images_someone"));
    await assert.rejects(
      () => this.binary.completeUpload(user, "images", file.hash),
      (e: any) => e.getResponseCode() === 400
    );
    assert.ok(!this.deleted.some(k => k.endsWith(`${file.hash}/data`)));
  }

  @test
  async completeOverMaxUploadSize() {
    this.binary.parameters.maxUploadSize = 10;
    // No declared size: only the limit applies
    const { user, file } = await this.pending("hello", { size: undefined });
    this.uploaded(file.hash, 11);
    await assert.rejects(
      () => this.binary.completeUpload(user, "images", file.hash),
      (e: any) => e.getResponseCode() === 400
    );
    assert.deepStrictEqual(await this.images(user.getUUID()), []);
    // Within the limit, any size completes when none was declared
    const second = await this.pending("other", { size: undefined });
    this.uploaded(second.file.hash, 7);
    await this.binary.completeUpload(second.user, "images", second.file.hash);
    assert.strictEqual((await this.images(second.user.getUUID()))[0].size, 7);
  }

  @test
  async completeTwiceIsIdempotent() {
    const { user, file } = await this.pending("hello");
    this.uploaded(file.hash, 5);
    await this.binary.completeUpload(user, "images", file.hash);
    await this.binary.completeUpload(user, "images", file.hash);
    assert.strictEqual((await this.images(user.getUUID())).length, 1);
    assert.strictEqual(this.uploadEvents.length, 1);
  }

  @test
  async completeWithoutPending() {
    const { file } = await this.file("never announced");
    this.uploaded(file.hash, 15);
    const user = await ImageUser.create({ uuid: "s3-nopending" } as any);
    await assert.rejects(
      () => this.binary.completeUpload(user, "images", file.hash),
      (e: any) => e.getResponseCode() === 404
    );
    assert.deepStrictEqual(await this.images(user.getUUID()), []);
    await assert.rejects(
      () => this.binary.completeUpload(user, "images", "../../escape"),
      (e: any) => e.getResponseCode() === 400
    );
    // Another object's pending upload does not complete this one
    const { file: f2 } = await this.pending("hello");
    this.uploaded(f2.hash, 5);
    await assert.rejects(
      () => this.binary.completeUpload(user, "images", f2.hash),
      (e: any) => e.getResponseCode() === 404
    );
  }

  @test
  async existingDataWithoutProofIsNotPending() {
    const { file, info } = await this.file("existing");
    this.uploaded(file.hash, 8);
    const user = await ImageUser.create({ uuid: "s3-noproof" } as any);
    // A hash copied from a reader: an upload url, but completing cannot attach the existing data
    const res = await this.binary.putRedirectUrl(user, "images", { ...info, challenge: "guess" });
    assert.strictEqual(res?.method, "PUT");
    await assert.rejects(
      () => this.binary.completeUpload(user, "images", file.hash),
      (e: any) => e.getResponseCode() === 404
    );
    assert.deepStrictEqual(await this.images(user.getUUID()), []);
  }

  @test
  async dedupStillAttachesImmediately() {
    const { file, info } = await this.file("dedup");
    this.uploaded(file.hash, 5);
    this.keys.push(this.binary._getKey(file.hash, `proof_${file.challenge}`));
    const user = await ImageUser.create({ uuid: "s3-dedup" } as any);
    assert.strictEqual(await this.binary.putRedirectUrl(user, "images", { ...info, size: 5 }), undefined);
    assert.strictEqual((await this.images(user.getUUID()))[0].hash, file.hash);
    assert.strictEqual(this.uploadEvents.length, 1);
    assert.ok(!this.written.some(k => k.includes("_pending/")));
  }

  @test
  async sweepRemovesStalePending() {
    const stale = await this.pending("stale");
    this.uploaded(stale.file.hash, 5);
    const fresh = await this.pending("fresh");
    this.uploaded(fresh.file.hash, 5);
    const used = await this.pending("used");
    this.uploaded(used.file.hash, 4);
    this.keys.push(this.binary._getKey(used.file.hash, "WebdaDemo-ImageUser_images_someone"));
    const age = (key: string, hours: number) => {
      const k = this.keys.find(k => k.includes(`_pending/${key}/`));
      this.objects.get(k).Metadata.created = `${Date.now() - hours * 3600 * 1000}`;
    };
    age(stale.file.hash, 25);
    age(fresh.file.hash, 1);
    age(used.file.hash, 25);
    assert.strictEqual(await this.binary.sweepPending(Date.now()), 2);
    assert.ok(this.deleted.some(k => k.includes(`_pending/${stale.file.hash}/`)));
    assert.ok(this.deleted.includes(this.binary._getKey(stale.file.hash)), "unused data removed");
    assert.ok(this.deleted.some(k => k.includes(`_pending/${used.file.hash}/`)));
    assert.ok(!this.deleted.includes(this.binary._getKey(used.file.hash)), "used data kept");
    assert.ok(
      this.keys.some(k => k.includes(`_pending/${fresh.file.hash}/`)),
      "recent upload kept"
    );
    assert.ok(this.keys.includes(this.binary._getKey(fresh.file.hash)));
    // The swept upload cannot complete any more
    await assert.rejects(
      () => this.binary.completeUpload(stale.user, "images", stale.file.hash),
      (e: any) => e.getResponseCode() === 404
    );
    assert.strictEqual(this.binary.parameters.pendingTimeout, 86400);
  }

  @test
  async sweepKeepsDataAnotherUploadWaitsFor() {
    // Two objects announce the same new content before it is uploaded
    const first = await this.pending("shared");
    const second = await this.pending("shared");
    this.uploaded(first.file.hash, 6);
    const firstKey = this.keys.find(k => k.endsWith(first.user.getUUID()) && k.includes("_pending/"));
    this.objects.get(firstKey).Metadata.created = `${Date.now() - 25 * 3600 * 1000}`;
    assert.strictEqual(await this.binary.sweepPending(), 1);
    assert.ok(!this.deleted.includes(this.binary._getKey(first.file.hash)), "the data is still awaited");
    await this.binary.completeUpload(second.user, "images", second.file.hash);
    assert.strictEqual((await this.images(second.user.getUUID())).length, 1);
  }

  @test
  async sweepRunsPeriodically() {
    const clock = vi.useFakeTimers();
    try {
      const svc = new S3Binary(
        "binary2",
        new S3BinaryParameters().load({ bucket: Bucket, region: "us-east-1", pendingTimeout: 40 })
      );
      this.registerService(svc).resolve();
      const sweep = vi.spyOn(svc, "sweepPending").mockResolvedValue(0);
      await svc.init();
      clock.advanceTimersByTime(10_000);
      assert.strictEqual(sweep.mock.calls.length, 1);
      await svc.stop();
      clock.advanceTimersByTime(30_000);
      assert.strictEqual(sweep.mock.calls.length, 1, "cleared on stop");
    } finally {
      vi.useRealTimers();
    }
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
