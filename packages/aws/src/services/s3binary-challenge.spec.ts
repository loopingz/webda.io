import {
  DeleteObjectCommand,
  GetObjectCommand,
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
import * as crypto from "node:crypto";
import { mockClient } from "aws-sdk-client-mock";
import { Readable } from "node:stream";
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
  objects: Map<string, { Metadata?: Record<string, string>; ContentLength?: number; Body?: Buffer }> = new Map();
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
      const Body = Buffer.from((p.Body as any) ?? "");
      this.objects.set(p.Key, { Metadata: p.Metadata, ContentLength: Body.length, Body });
      return {};
    });
    this.mock.on(GetObjectCommand).callsFake(async p => {
      if (!this.keys.includes(p.Key)) {
        throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
      }
      return { Body: Readable.from([this.objects.get(p.Key)?.Body ?? Buffer.alloc(0)]) };
    });
    this.mock.on(HeadObjectCommand).callsFake(async p => {
      if (!this.keys.includes(p.Key)) {
        throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
      }
      const { Body: _body, ...head } = this.objects.get(p.Key) ?? {};
      return { ContentLength: 0, Metadata: {}, ...head };
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
   * Simulate the client's PUT to the signed url: the data object holds these bytes
   * @param content - the uploaded content
   * @param size - the size HEAD reports, default to the content length
   */
  uploaded(content: string, size?: number) {
    const Body = Buffer.from(content);
    const key = this.binary._getKey(crypto.createHash("md5").update(Body).digest("hex"));
    this.keys.push(key);
    this.objects.set(key, { ContentLength: size ?? Body.length, Body });
  }

  /**
   * @param key - a pending marker key
   * @returns its JSON body
   */
  pendingInfo(key: string): any {
    return JSON.parse(this.objects.get(key).Body.toString());
  }

  /**
   * Age a pending marker
   * @param hash - the binary hash
   * @param hours - its age
   * @param uuid - the object uuid, when several markers exist for the hash
   */
  age(hash: string, hours: number, uuid: string = "") {
    const key = this.keys.find(k => k.includes(`_pending/${hash}/`) && k.endsWith(uuid));
    const obj = this.objects.get(key);
    obj.Body = Buffer.from(JSON.stringify({ ...this.pendingInfo(key), created: Date.now() - hours * 3600 * 1000 }));
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
    this.keys.push(this.binary._getKey(file.hash), this.binary._getKey(file.hash, `vproof_${file.challenge}`));
    // A reader copying the hash with a wrong challenge: an upload URL, nothing attached
    const attacker = await User.create({ uuid: "s3-attacker" } as any);
    const res = await this.binary.putRedirectUrl(attacker, "images", { ...info, challenge: "not-the-challenge" });
    assert.strictEqual(res?.method, "PUT");
    assert.strictEqual((attacker as any).images, undefined);
    assert.strictEqual(((await User.ref("s3-attacker").get()) as any).images, undefined);
    assert.ok(
      this.written.every(k => k.includes("_pending/")),
      "only a pending marker written for the attacker"
    );
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
    assert.ok(pendingKeys[0].endsWith(`WebdaDemo~2FImageUser_images_${user.getUUID()}`), pendingKeys[0]);
    assert.ok(!pendingKeys[0].includes(file.challenge));
    assert.ok(!this.written.some(k => k.endsWith(`vproof_${file.challenge}`)), "proof only after verification");
    assert.ok(!this.written.some(k => k.endsWith(`images_${user.getUUID()}`) && !k.includes("_pending/")));
    // The marker body carries what completion needs, server side only
    const info = this.pendingInfo(pendingKeys[0]);
    assert.strictEqual(info.challenge, file.challenge);
    assert.strictEqual(info.size, 5);
    assert.strictEqual(info.name, "a.png");
    assert.ok(Math.abs(Date.now() - info.created) < 10000);
    // Signed with the size
    const params = (this.binary.getSignedUrl as any).mock.calls.at(-1)[2];
    assert.strictEqual(params.ContentLength, 5);
  }

  @test
  async largeMetadataFitsThePendingMarker() {
    // S3 user metadata is limited to 2 KB: the info lives in the marker body
    const metadata = { text: "é".repeat(1500) };
    const { user, file } = await this.pending("hello", { metadata });
    this.uploaded("hello");
    await this.binary.completeUpload(user, "images", file.hash);
    assert.deepStrictEqual({ ...(await this.images(user.getUUID()))[0].metadata }, metadata);
  }

  @test
  async noDeclaredSizeIsNotSigned() {
    const { user, file } = await this.pending("hello", { size: undefined });
    const params = (this.binary.getSignedUrl as any).mock.calls.at(-1)[2];
    assert.strictEqual(params.ContentLength, undefined);
    // Any size completes without a declared one (and no limit)
    this.uploaded("hello");
    await this.binary.completeUpload(user, "images", file.hash);
    assert.strictEqual((await this.images(user.getUUID()))[0].size, 5);
  }

  @test
  async completeAttachesAfterHead() {
    const { user, file } = await this.pending("hello", { name: "l'été.png", metadata: { title: "été" } });
    this.uploaded("hello");
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
    assert.ok(this.written.some(k => k.endsWith(`vproof_${file.challenge}`)));
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
    this.uploaded("hello");
    await this.binary.completeUpload(user, "images", file.hash);
    assert.strictEqual((await this.images(user.getUUID())).length, 1);
  }

  @test
  async completeSizeMismatch() {
    const { user, file } = await this.pending("hello");
    this.uploaded("hello", 6);
    await assert.rejects(
      () => this.binary.completeUpload(user, "images", file.hash),
      (e: any) => e.getResponseCode() === 400
    );
    assert.ok(
      this.deleted.some(k => k.endsWith(`${file.hash}/data`)),
      "unused data removed"
    );
    assert.ok(this.deleted.some(k => k.includes(`_pending/${file.hash}/`)));
    assert.ok(!this.written.some(k => k.includes("proof_")));
    assert.deepStrictEqual(await this.images(user.getUUID()), []);
    assert.strictEqual(this.uploadEvents.length, 0);
  }

  @test
  async completeSizeMismatchKeepsUsedData() {
    const { user, file } = await this.pending("hello");
    this.uploaded("hello", 6);
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
    this.uploaded("hello", 11);
    await assert.rejects(
      () => this.binary.completeUpload(user, "images", file.hash),
      (e: any) => e.getResponseCode() === 400
    );
    assert.deepStrictEqual(await this.images(user.getUUID()), []);
    // Within the limit, any size completes when none was declared
    const second = await this.pending("other", { size: undefined });
    this.uploaded("other");
    await this.binary.completeUpload(second.user, "images", second.file.hash);
    assert.strictEqual((await this.images(second.user.getUUID()))[0].size, 5);
  }

  @test
  async completeTwiceIsIdempotent() {
    const { user, file } = await this.pending("hello");
    this.uploaded("hello");
    await this.binary.completeUpload(user, "images", file.hash);
    await this.binary.completeUpload(user, "images", file.hash);
    assert.strictEqual((await this.images(user.getUUID())).length, 1);
    assert.strictEqual(this.uploadEvents.length, 1);
  }

  /**
   * A second completion racing the first: it passed the pending check with a stale instance; the re-load before
   * linking sees the item, nothing is appended twice
   */
  @test
  async concurrentCompleteLinksOnce() {
    const { user, file } = await this.pending("hello");
    const stale: any = await ImageUser.ref(user.getUUID()).get();
    const markerKey = this.keys.find(k => k.includes(`_pending/${file.hash}/`));
    const marker = this.objects.get(markerKey);
    this.uploaded("hello");
    await this.binary.completeUpload(user, "images", file.hash);
    // The racing request still sees the marker and the stale attribute
    this.keys.push(markerKey);
    this.objects.set(markerKey, marker);
    assert.strictEqual([...(stale.images ?? [])].length, 0);
    await this.binary.completeUpload(stale, "images", file.hash);
    assert.strictEqual((await this.images(user.getUUID())).length, 1);
    assert.strictEqual(this.uploadEvents.length, 1);
  }

  @test
  async completeWithoutPending() {
    const { file } = await this.file("never announced");
    this.uploaded("never announced");
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
    this.uploaded("hello");
    await assert.rejects(
      () => this.binary.completeUpload(user, "images", f2.hash),
      (e: any) => e.getResponseCode() === 404
    );
  }

  /**
   * Hash-only attach: announcing a known hash with a made-up challenge, then completing once someone else uploaded
   * the bytes, attaches nothing (the challenge is checked against the stored bytes)
   */
  @test
  async fakeChallengeCannotCompleteAnotherUpload() {
    const content = "the victim's private file";
    const { file, info } = await this.file(content);
    const attacker = await ImageUser.create({ uuid: "s3-attacker2" } as any);
    await this.binary.putRedirectUrl(attacker, "images", { ...info, challenge: "fake", size: content.length });
    const victim = await ImageUser.create({ uuid: "s3-victim" } as any);
    await this.binary.putRedirectUrl(victim, "images", { ...info, size: content.length });
    this.uploaded(content);
    await assert.rejects(
      () => this.binary.completeUpload(attacker, "images", file.hash),
      (e: any) => e.getResponseCode() === 400
    );
    assert.deepStrictEqual(await this.images(attacker.getUUID()), []);
    assert.ok(!this.written.some(k => k.includes("proof_")), "no proof from a client value");
    assert.ok(!this.deleted.includes(this.binary._getKey(file.hash)), "the victim's upload is still awaited");
    await this.binary.completeUpload(victim, "images", file.hash);
    assert.strictEqual((await this.images(victim.getUUID())).length, 1);
    assert.deepStrictEqual(
      this.written.filter(k => k.includes("proof_")),
      [this.binary._getKey(file.hash, `vproof_${file.challenge}`)]
    );
    assert.strictEqual(this.uploadEvents.length, 1);
  }

  @test
  async completeWithoutChallengeIsRejected() {
    const { user, file } = await this.pending("hello", { challenge: undefined });
    this.uploaded("hello");
    await assert.rejects(
      () => this.binary.completeUpload(user, "images", file.hash),
      (e: any) => e.getResponseCode() === 400
    );
    assert.deepStrictEqual(await this.images(user.getUUID()), []);
    assert.ok(!this.written.some(k => k.includes("proof_")));
  }

  /**
   * Existing data without a matching proof (legacy, or a poisoned proof): the holder proves possession by completing
   */
  @test
  async poisonedProofDoesNotBlockHonestHolders() {
    const { file, info } = await this.file("existing");
    this.uploaded("existing");
    this.keys.push(this.binary._getKey(file.hash, "vproof_bogus"));
    // Another object uses the data: a rejected completion keeps it
    this.keys.push(this.binary._getKey(file.hash, "WebdaDemo-ImageUser_images_someone"));
    const guesser = await ImageUser.create({ uuid: "s3-guess" } as any);
    const res = await this.binary.putRedirectUrl(guesser, "images", { ...info, challenge: "guess" });
    assert.strictEqual(res?.method, "PUT");
    await assert.rejects(
      () => this.binary.completeUpload(guesser, "images", file.hash),
      (e: any) => e.getResponseCode() === 400
    );
    assert.deepStrictEqual(await this.images(guesser.getUUID()), []);
    const holder = await ImageUser.create({ uuid: "s3-honest" } as any);
    const upload = await this.binary.putRedirectUrl(holder, "images", info);
    assert.strictEqual(upload?.method, "PUT", "the bogus proof does not match");
    await this.binary.completeUpload(holder, "images", file.hash);
    assert.strictEqual((await this.images(holder.getUUID()))[0].hash, file.hash);
    // Several proofs now: the real one dedupes at once
    const next = await ImageUser.create({ uuid: "s3-next" } as any);
    assert.strictEqual(await this.binary.putRedirectUrl(next, "images", info), undefined);
    assert.strictEqual((await this.images(next.getUUID())).length, 1);
  }

  @test
  async dedupStillAttachesImmediately() {
    const { file, info } = await this.file("dedup");
    this.uploaded("dedup");
    this.keys.push(this.binary._getKey(file.hash, `vproof_${file.challenge}`));
    const user = await ImageUser.create({ uuid: "s3-dedup" } as any);
    assert.strictEqual(await this.binary.putRedirectUrl(user, "images", { ...info, size: 5 }), undefined);
    assert.strictEqual((await this.images(user.getUUID()))[0].hash, file.hash);
    assert.strictEqual(this.uploadEvents.length, 1);
    assert.ok(!this.written.some(k => k.includes("_pending/")));
  }

  @test
  async invalidHashIsRejected() {
    const user = await ImageUser.create({ uuid: "s3-badhash" } as any);
    await assert.rejects(
      () => this.binary.putRedirectUrl(user, "images", { hash: "../x", challenge: "c" } as any),
      (e: any) => e.getResponseCode() === 400
    );
    assert.deepStrictEqual(this.written, []);
  }

  @test
  async pendingKeysAreUnambiguous() {
    const a: any = { constructor: ImageUser, getUUID: () => "c" };
    const b: any = { constructor: ImageUser, getUUID: () => "b_c" };
    const keyA = (this.binary as any).getPendingKey(a, "a_b", "abc");
    const keyB = (this.binary as any).getPendingKey(b, "a", "abc");
    assert.notStrictEqual(keyA, keyB);
    assert.ok(keyA.startsWith("_pending/abc/"), keyA);
    // No path segment from the parts
    const c: any = { constructor: ImageUser, getUUID: () => "../../x" };
    assert.strictEqual((this.binary as any).getPendingKey(c, "p", "abc").split("/").length, 3);
  }

  @test
  async pendingTimeoutMustBePositive() {
    for (const pendingTimeout of [0, -1]) {
      assert.throws(() => new S3BinaryParameters().load({ bucket: Bucket, pendingTimeout }), /pendingTimeout/);
    }
  }

  @test
  async sweepRemovesStalePending() {
    const stale = await this.pending("stale");
    this.uploaded("stale");
    const fresh = await this.pending("fresh");
    this.uploaded("fresh");
    const used = await this.pending("used");
    this.uploaded("used");
    this.keys.push(this.binary._getKey(used.file.hash, "WebdaDemo-ImageUser_images_someone"));
    this.age(stale.file.hash, 25);
    this.age(fresh.file.hash, 1);
    this.age(used.file.hash, 25);
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
    this.uploaded("shared");
    this.age(first.file.hash, 25, first.user.getUUID());
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
  /**
   * Proofs written before every proof was computed by the service (`proof_<challenge>`, from a client announced
   * value) are ignored: the holder uploads once more
   */
  @test
  async legacyProofIsIgnored() {
    const { file, info } = await this.file("legacy proof");
    this.uploaded("legacy proof");
    this.keys.push(this.binary._getKey(file.hash, `proof_${file.challenge}`));
    const user = await ImageUser.create({ uuid: "s3-legacy-proof" } as any);
    const res = await this.binary.putRedirectUrl(user, "images", info);
    assert.strictEqual(res?.method, "PUT", "an upload is required");
    assert.deepStrictEqual(await this.images(user.getUUID()), []);
    assert.ok(
      this.written.some(k => k.includes(`_pending/${file.hash}/`)),
      "pending, not attached"
    );
    assert.strictEqual(this.uploadEvents.length, 0);
    // Legacy proofs are no usage either
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 0);
  }

  /**
   * Usage marker name: `@<model>_<attribute>_<uuid>`, each part encoded (`/` is `~2F`, `_` is `~5F`)
   * @param hash - the binary hash
   * @param attribute - the binary attribute
   * @param uuid - the owner uuid
   * @param model - the model identifier
   * @returns the marker key
   */
  marker(hash: string, attribute: string, uuid: string, model: string = "WebdaDemo/ImageUser"): string {
    const enc = (p: string) => p.replace(/~/g, "~7E").replace(/\//g, "~2F").replace(/_/g, "~5F");
    return this.binary._getKey(hash, `@${enc(model)}_${enc(attribute)}_${enc(uuid)}`);
  }

  /**
   * A legacy usage marker (`<attribute>_<uuid>`, before the model was in the name), its model in the metadata
   * @param hash - the binary hash
   * @param attribute - the binary attribute
   * @param uuid - the owner uuid
   * @param model - the model identifier stored in the metadata
   * @returns the marker key
   */
  legacyMarker(hash: string, attribute: string, uuid: string, model: string): string {
    const key = this.binary._getKey(hash, `${attribute}_${uuid}`);
    this.keys.push(key);
    this.objects.set(key, { Metadata: { "x-amz-meta-store": model }, ContentLength: 0 });
    return key;
  }

  /**
   * Deleting a model removes its own usage markers only: deduplicated data shared with another model is kept until
   * the last usage goes, then the data and its proofs are removed
   */
  @test
  async cascadeDeleteKeepsSharedData() {
    const { file } = await this.file("shared");
    this.uploaded("shared");
    const data = this.binary._getKey(file.hash);
    const proof = this.binary._getKey(file.hash, `vproof_${file.challenge}`);
    const legacy = this.binary._getKey(file.hash, `proof_${file.challenge}`);
    const first = this.marker(file.hash, "images", "owner-a");
    const firstOther = this.marker(file.hash, "profile", "owner-a");
    const second = this.marker(file.hash, "images", "owner-b");
    this.keys.push(proof, legacy, first, firstOther, second);
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 3);
    await this.binary.cascadeDelete({ hash: file.hash } as any, "owner-a", "images", "WebdaDemo/ImageUser");
    await this.binary.cascadeDelete({ hash: file.hash } as any, "owner-a", "profile", "WebdaDemo/ImageUser");
    assert.ok(this.keys.includes(data), "shared data kept");
    assert.ok(this.keys.includes(proof), "proof kept");
    assert.ok(this.keys.includes(second), "the other owner's usage kept");
    assert.ok(!this.keys.includes(first) && !this.keys.includes(firstOther), "every usage of the deleted owner gone");
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 1);
    // A pending upload (no proof of possession) still waits for the data: kept
    const waiting = await this.pending("shared", { challenge: "unproven" });
    await this.binary.cascadeDelete({ hash: file.hash } as any, "owner-b", "images", "WebdaDemo/ImageUser");
    assert.ok(this.keys.includes(data), "data awaited by a pending upload kept");
    await this.binary.sweepPending(Date.now() + 2 * 86400 * 1000);
    assert.ok(!this.keys.includes(data), "unused data removed by the sweep");
    assert.ok(!this.keys.some(k => k.startsWith(`${file.hash}/`)), "proofs removed with the data");
    assert.deepStrictEqual(await this.images(waiting.user.getUUID()), []);
  }

  /**
   * The last owner's cascade removes the data and its proofs
   */
  @test
  async cascadeDeleteOfTheLastOwnerRemovesData() {
    const { file } = await this.file("single");
    this.uploaded("single");
    this.keys.push(
      this.binary._getKey(file.hash, `vproof_${file.challenge}`),
      this.marker(file.hash, "images", "owner-a"),
      this.marker(file.hash, "images", "owner-b")
    );
    await this.binary.cascadeDelete({ hash: file.hash } as any, "owner-a", "images", "WebdaDemo/ImageUser");
    assert.ok(this.keys.includes(this.binary._getKey(file.hash)));
    await this.binary.cascadeDelete({ hash: file.hash } as any, "owner-b", "images", "WebdaDemo/ImageUser");
    assert.ok(!this.keys.some(k => k.startsWith(`${file.hash}/`)), "data and proofs gone");
  }

  /**
   * A cascade removes the exact usage marker of the deleted owner: owners whose uuid ends with `_<uuid>` (a uuid
   * `my_page`, a junction id `a_page`) or the same owner on another attribute keep their marker, and the shared data
   * stays until its last usage goes
   */
  @test
  async cascadeDeleteKeepsSuffixSharingOwners() {
    const { file } = await this.file("suffix");
    this.uploaded("suffix");
    const data = this.binary._getKey(file.hash);
    const page = this.marker(file.hash, "files", "page");
    const myPage = this.marker(file.hash, "files", "my_page");
    const junction = this.marker(file.hash, "files", "a_page");
    const otherAttribute = this.marker(file.hash, "profile", "page");
    this.keys.push(this.binary._getKey(file.hash, `vproof_${file.challenge}`), page, myPage, junction, otherAttribute);
    await this.binary.cascadeDelete({ hash: file.hash } as any, "page", "files", "WebdaDemo/ImageUser");
    assert.deepStrictEqual(
      this.deleted.filter(k => k.startsWith(`${file.hash}/`)),
      [page],
      "only the exact marker of the deleted owner"
    );
    assert.ok(this.keys.includes(myPage), "my_page marker kept");
    assert.ok(this.keys.includes(junction), "a_page marker kept");
    assert.ok(this.keys.includes(otherAttribute), "the other attribute's marker kept");
    assert.ok(this.keys.includes(data), "data still referenced kept");
    await this.binary.cascadeDelete({ hash: file.hash } as any, "my_page", "files", "WebdaDemo/ImageUser");
    await this.binary.cascadeDelete({ hash: file.hash } as any, "a_page", "files", "WebdaDemo/ImageUser");
    assert.ok(this.keys.includes(data), "data still referenced by the profile marker kept");
    await this.binary.cascadeDelete({ hash: file.hash } as any, "page", "profile", "WebdaDemo/ImageUser");
    assert.ok(!this.keys.some(k => k.startsWith(`${file.hash}/`)), "data and proofs gone with the last usage");
  }

  /**
   * The marker names the model: two models whose objects share a uuid, an attribute and a hash have their own
   * marker, deleting one keeps the other's usage and the data
   */
  @test
  async cascadeDeleteSameUuidOtherModel() {
    const { file } = await this.file("models");
    this.uploaded("models");
    const data = this.binary._getKey(file.hash);
    const mine = this.marker(file.hash, "files", "page", "WebdaDemo/Page");
    const other = this.marker(file.hash, "files", "page", "WebdaDemo/Other");
    this.keys.push(this.binary._getKey(file.hash, `vproof_${file.challenge}`), mine, other);
    await this.binary.cascadeDelete({ hash: file.hash } as any, "page", "files", "WebdaDemo/Page");
    assert.deepStrictEqual(
      this.deleted.filter(k => k.startsWith(`${file.hash}/`)),
      [mine]
    );
    assert.ok(this.keys.includes(other), "the other model's marker kept");
    assert.ok(this.keys.includes(data), "data the other model references kept");
    await this.binary.cascadeDelete({ hash: file.hash } as any, "page", "files", "WebdaDemo/Other");
    assert.ok(!this.keys.includes(data), "data gone with the last usage");
  }

  /**
   * Legacy `<attribute>_<uuid>` markers still count as usages; a cascade removes one only when its stored model is
   * the deleted object's
   */
  @test
  async cascadeDeleteLegacyMarkerOfItsModelOnly() {
    const { file } = await this.file("legacy markers");
    this.uploaded("legacy markers");
    const data = this.binary._getKey(file.hash);
    this.keys.push(this.binary._getKey(file.hash, `vproof_${file.challenge}`));
    const legacy = this.legacyMarker(file.hash, "files", "page", "WebdaDemo/Other");
    const mine = this.marker(file.hash, "files", "page", "WebdaDemo/Page");
    this.keys.push(mine);
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 2, "legacy and new markers are usages");
    await this.binary.cascadeDelete({ hash: file.hash } as any, "page", "files", "WebdaDemo/Page");
    assert.ok(this.keys.includes(legacy), "another model's legacy marker kept");
    assert.ok(!this.keys.includes(mine));
    assert.ok(this.keys.includes(data), "data the legacy usage references kept");
    await this.binary.cascadeDelete({ hash: file.hash } as any, "page", "files", "WebdaDemo/Other");
    assert.ok(!this.keys.includes(legacy), "its own model's legacy marker removed");
    assert.ok(!this.keys.includes(data), "data gone with the last usage");
  }

  /**
   * Attaching writes the model-qualified marker with the model in its metadata
   */
  @test
  async attachWritesTheModelMarker() {
    const user = await ImageUser.create({ uuid: "s3-model_marker" } as any);
    await this.binary.store(user, "images", new MemoryBinaryFile(Buffer.from("marker"), { name: "m.txt" }));
    const hash = crypto.createHash("md5").update(Buffer.from("marker")).digest("hex");
    const key = this.marker(hash, "images", "s3-model_marker");
    assert.ok(this.written.includes(key), `${key} in ${this.written}`);
    assert.strictEqual(this.objects.get(key)?.Metadata?.["x-amz-meta-store"], "WebdaDemo/ImageUser");
  }

  /**
   * Without an attribute the owner's markers cannot be told apart from suffix-sharing ones: nothing is removed
   */
  @test
  async cleanUsageWithoutAttributeKeepsMarkers() {
    const { file } = await this.file("no attribute");
    this.uploaded("no attribute");
    this.keys.push(this.marker(file.hash, "files", "page"), this.marker(file.hash, "files", "my_page"));
    await this.binary._cleanUsage(file.hash, "page", undefined as any, "WebdaDemo/ImageUser");
    await this.binary._cleanUsage(file.hash, "page", "files", undefined as any);
    assert.deepStrictEqual(this.deleted, []);
  }

  /**
   * `store` computes the hashes from the bytes: a preset hash that does not match is rejected, nothing is written
   */
  @test
  async storeRejectsAPresetWrongHash() {
    const user = await ImageUser.create({ uuid: "s3-store-hash" } as any);
    const { file: other } = await this.file("other content");
    this.uploaded("other content");
    const forged = new MemoryBinaryFile(Buffer.from("mine"), { name: "m.txt", hash: other.hash });
    await assert.rejects(
      () => this.binary.store(user, "images", forged),
      (e: any) => e.getResponseCode() === 400
    );
    assert.deepStrictEqual(this.written, []);
    assert.deepStrictEqual(await this.images(user.getUUID()), []);
  }

  /**
   * `store` writes the proof of the challenge it computed, never a preset one
   */
  @test
  async storeWritesTheComputedProofOnly() {
    const user = await ImageUser.create({ uuid: "s3-store-challenge" } as any);
    const { file } = await this.file("stored");
    this.uploaded("stored");
    const preset = new MemoryBinaryFile(Buffer.from("stored"), {
      name: "s.txt",
      hash: file.hash.toUpperCase(),
      challenge: "forged"
    });
    await this.binary.store(user, "images", preset);
    assert.deepStrictEqual(
      this.written.filter(k => k.includes("proof_")),
      [this.binary._getKey(file.hash, `vproof_${file.challenge}`)]
    );
    assert.strictEqual((await this.images(user.getUUID()))[0].hash, file.hash);
  }

  /**
   * Hashes are lower case: an upper-case announce names the same keys and completes, dedup attaches the lower case
   */
  @test
  async upperCaseHashesAreNormalised() {
    const { file, info } = await this.file("casing");
    const user = await ImageUser.create({ uuid: "s3-case" } as any);
    const res = await this.binary.putRedirectUrl(user, "images", {
      ...info,
      hash: file.hash.toUpperCase(),
      challenge: file.challenge.toUpperCase()
    });
    assert.strictEqual(res?.method, "PUT");
    assert.ok(
      this.written.every(k => !k.includes(file.hash.toUpperCase())),
      "keys use the lower case"
    );
    assert.ok(this.written.some(k => k.includes(`_pending/${file.hash}/`)));
    this.uploaded("casing");
    await this.binary.completeUpload(user, "images", file.hash.toUpperCase());
    assert.strictEqual((await this.images(user.getUUID()))[0].hash, file.hash);
    // Already linked whatever the case
    await this.binary.completeUpload(user, "images", file.hash.toUpperCase());
    assert.strictEqual(this.uploadEvents.length, 1);
    const other = await ImageUser.create({ uuid: "s3-case-2" } as any);
    assert.strictEqual(
      await this.binary.putRedirectUrl(other, "images", {
        ...info,
        hash: file.hash.toUpperCase(),
        challenge: file.challenge.toUpperCase()
      }),
      undefined
    );
    assert.strictEqual((await this.images(other.getUUID()))[0].hash, file.hash);
  }

  /**
   * A usage marker of another attribute whose name ends like this one (`userimages_<uuid>` vs `images_<uuid>`) is not
   * a link: the object's own attribute decides
   */
  @test
  async suffixNamedAttributeIsNotALink() {
    const { file, info } = await this.file("suffix");
    this.uploaded("suffix");
    const user = await ImageUser.create({ uuid: "s3-suffix" } as any);
    this.keys.push(this.binary._getKey(file.hash, `userimages_${user.getUUID()}`));
    const res = await this.binary.putRedirectUrl(user, "images", info);
    assert.strictEqual(res?.method, "PUT", "not done: nothing is linked to images");
  }

  /**
   * Dedup records the size of the stored object, not the declared one, and enforces maxUploadSize on it
   */
  @test
  async dedupRecordsTheStoredSize() {
    const { file, info } = await this.file("dedup size");
    this.uploaded("dedup size");
    this.keys.push(this.binary._getKey(file.hash, `vproof_${file.challenge}`));
    const user = await ImageUser.create({ uuid: "s3-dedup-size" } as any);
    assert.strictEqual(await this.binary.putRedirectUrl(user, "images", { ...info, size: 1 }), undefined);
    assert.strictEqual((await this.images(user.getUUID()))[0].size, "dedup size".length);
    this.binary.parameters.maxUploadSize = 4;
    const small = await ImageUser.create({ uuid: "s3-dedup-small" } as any);
    await assert.rejects(
      () => this.binary.putRedirectUrl(small, "images", { ...info, size: 1 }),
      (e: any) => e.getResponseCode() === 400
    );
    assert.deepStrictEqual(await this.images(small.getUUID()), []);
  }

  /**
   * Without an explicit body the challenge is read from the operation input
   */
  @test
  async challengeFromTheOperationInput() {
    const { file, info } = await this.file("from input");
    const user = await ImageUser.create({ uuid: "s3-input" } as any);
    const context: any = { getInput: async () => ({ ...info, hash: file.hash.toUpperCase() }) };
    const res = await this.binary.putRedirectUrl(user, "images", undefined, context);
    assert.strictEqual(res?.method, "PUT");
    assert.ok(
      this.written.some(k => k.includes(`_pending/${file.hash}/`)),
      "the hash is normalised"
    );
  }

  /**
   * A dedup without mimetype nor metadata stores the defaults
   */
  @test
  async dedupWithoutMimetypeNorMetadata() {
    const { file } = await this.file("bare dedup");
    this.uploaded("bare dedup");
    this.keys.push(this.binary._getKey(file.hash, `vproof_${file.challenge}`));
    const user = await ImageUser.create({ uuid: "s3-bare-dedup" } as any);
    assert.strictEqual(
      await this.binary.putRedirectUrl(user, "images", { hash: file.hash, challenge: file.challenge } as any),
      undefined
    );
    const [image] = await this.images(user.getUUID());
    assert.strictEqual(image.mimetype, "application/octet-stream");
    assert.deepStrictEqual({ ...image.metadata }, {});
  }

  /**
   * The data listed but gone before its HEAD (concurrent removal): the client uploads it again
   */
  @test
  async dedupDataGoneBeforeHead() {
    const { file, info } = await this.file("vanished");
    this.uploaded("vanished");
    this.keys.push(this.binary._getKey(file.hash, `vproof_${file.challenge}`));
    vi.spyOn(this.binary, "_getS3").mockResolvedValue(undefined);
    const user = await ImageUser.create({ uuid: "s3-vanished" } as any);
    const res = await this.binary.putRedirectUrl(user, "images", info);
    assert.strictEqual(res?.method, "PUT");
    assert.deepStrictEqual(await this.images(user.getUUID()), []);
  }

  /**
   * A completion without announced mimetype nor metadata stores the defaults
   */
  @test
  async completeWithoutMimetypeNorMetadata() {
    const { user, file } = await this.pending("bare", { mimetype: undefined, metadata: undefined });
    this.uploaded("bare");
    await this.binary.completeUpload(user, "images", file.hash);
    const [image] = await this.images(user.getUUID());
    assert.strictEqual(image.mimetype, "application/octet-stream");
    assert.deepStrictEqual({ ...image.metadata }, {});
  }

  /**
   * An unreadable (or `null`) pending marker carries no challenge: the completion is rejected
   */
  @test
  async unreadablePendingMarkerIsRejected() {
    for (const body of ["not json", "null"]) {
      const { user, file } = await this.pending(`unreadable ${body}`);
      this.uploaded(`unreadable ${body}`);
      const key = this.keys.find(k => k.includes(`_pending/${file.hash}/`));
      this.objects.get(key).Body = Buffer.from(body);
      await assert.rejects(
        () => this.binary.completeUpload(user, "images", file.hash),
        (e: any) => e.getResponseCode() === 400
      );
      assert.deepStrictEqual(await this.images(user.getUUID()), []);
    }
  }

  /**
   * A failure reading the pending marker other than its absence is reported, not taken for a missing upload
   */
  @test
  async pendingReadFailureIsReported() {
    const { user, file } = await this.pending("read failure");
    vi.spyOn(this.binary, "getContent").mockRejectedValue(new Error("S3 unavailable"));
    await assert.rejects(() => this.binary.completeUpload(user, "images", file.hash), /S3 unavailable/);
  }

  /**
   * The sweep falls back to the modification date of an unreadable marker, and skips a marker removed meanwhile
   */
  @test
  async sweepUnreadableAndVanishedMarkers() {
    const stale = await this.pending("unreadable stale");
    const fresh = await this.pending("unreadable fresh");
    const staleKey = this.keys.find(k => k.includes(`_pending/${stale.file.hash}/`));
    const freshKey = this.keys.find(k => k.includes(`_pending/${fresh.file.hash}/`));
    this.objects.set(staleKey, {
      ...this.objects.get(staleKey),
      Body: Buffer.from("not json"),
      LastModified: new Date(Date.now() - 25 * 3600 * 1000)
    } as any);
    this.objects.set(freshKey, {
      ...this.objects.get(freshKey),
      Body: Buffer.from("not json"),
      LastModified: new Date()
    } as any);
    assert.strictEqual(await this.binary.sweepPending(), 1);
    assert.ok(this.deleted.includes(staleKey));
    assert.ok(this.keys.includes(freshKey));
    // Listed but removed before it is read (a concurrent completion): nothing to sweep
    vi.spyOn(this.binary as any, "getPendingUpload").mockResolvedValue(undefined);
    assert.strictEqual(await this.binary.sweepPending(Date.now() + 48 * 3600 * 1000), 0);
    assert.ok(this.keys.includes(freshKey));
  }

  /**
   * A legacy marker whose model is stored under the `store` metadata key (as S3 returns it) is removed with its model
   */
  @test
  async cascadeDeleteLegacyMarkerStoreMetadata() {
    const { file } = await this.file("legacy store");
    this.uploaded("legacy store");
    const legacy = this.legacyMarker(file.hash, "files", "page", "WebdaDemo/Page");
    this.objects.set(legacy, { Metadata: { store: "WebdaDemo/Page" }, ContentLength: 0 });
    await this.binary._cleanUsage(file.hash, "page", "files", "WebdaDemo/Page");
    assert.ok(this.deleted.includes(legacy));
  }

  /**
   * A failing periodic sweep is logged, a failing cascade delete is logged and does not reject
   */
  @test
  async sweepAndCascadeFailuresAreLogged() {
    const clock = vi.useFakeTimers();
    try {
      const log = vi.spyOn(this.binary, "log");
      vi.spyOn(this.binary, "sweepPending").mockRejectedValue(new Error("sweep failed"));
      await this.binary.init();
      await clock.advanceTimersByTimeAsync(this.binary.parameters.pendingTimeout * 250);
      assert.ok(log.mock.calls.some(c => c[1] === "Cannot sweep pending uploads"));
      vi.spyOn(this.binary, "_cleanUsage").mockRejectedValue(new Error("clean failed"));
      await this.binary.cascadeDelete({ hash: "abc" } as any, "page", "files", "WebdaDemo/Page");
      assert.ok(log.mock.calls.some(c => c[1] === "Cascade delete failed"));
      await this.binary.stop();
    } finally {
      vi.useRealTimers();
    }
  }

  /**
   * A challenge for a hash the object already links is a no-op
   */
  @test
  async challengeOfAnAlreadyLinkedHash() {
    const { user, file } = await this.pending("linked");
    this.uploaded("linked");
    await this.binary.completeUpload(user, "images", file.hash);
    const written = this.written.length;
    const reloaded = await ImageUser.ref(user.getUUID()).get();
    assert.strictEqual(
      await this.binary.putRedirectUrl(reloaded, "images", { ...file.toBinaryFileInfo(), size: 6 }),
      undefined
    );
    assert.strictEqual(this.written.length, written, "nothing written");
    assert.strictEqual((await this.images(user.getUUID())).length, 1);
  }
}
