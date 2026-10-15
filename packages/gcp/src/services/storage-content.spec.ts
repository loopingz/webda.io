import {
  ContentCredentialNotFoundError,
  ContentExistsError,
  ContentNotFoundError,
  ContentStorages,
  getContent,
  putContent
} from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { ContentStorageContract } from "@webda/utils";
import { afterEach, beforeEach, suite, test } from "@webda/test";
import * as assert from "assert";
import { Readable, Writable } from "node:stream";
import { vi } from "vitest";
import Storage, { GCSFinder, StorageParameters } from "./storage.service.js";

const TEST_BUCKET = "gcs-unit-bucket";

interface MockGCSFile {
  buffer: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
  etag: string;
  generation: number;
  updated: Date;
}

@suite
class GCSStorageContentTest extends WebdaApplicationTest {
  private files = new Map<string, MockGCSFile>();
  private storage: Storage;

  private contract = ContentStorageContract(async () => {
    return {
      storage: this.storage,
      baseUrl: `gs://${TEST_BUCKET}`,
      isCloud: true
    };
  })();

  @beforeEach
  async beforeEach() {
    await super.beforeEach();
    this.files.clear();

    this.storage = this.registerService(
      new Storage(
        "gcstest",
        new StorageParameters().load({
          bucket: TEST_BUCKET
        })
      )
    ).resolve();

    vi.spyOn(this.storage, "getStorageBucket").mockImplementation((bucketName: string = TEST_BUCKET) => {
      const getFileKey = (k: string) => `${bucketName}/${k}`;

      return <any>{
        file: (key: string) => {
          const fullKey = getFileKey(key);

          return {
            name: key,
            bucket: { name: bucketName },
            exists: async () => [this.files.has(fullKey)],
            getMetadata: async () => {
              const file = this.files.get(fullKey);
              if (!file) {
                const err: any = new Error("Not Found");
                err.code = 404;
                err.status = 404;
                err.name = "NotFoundError";
                throw err;
              }
              return [
                {
                  size: file.buffer.length,
                  contentType: file.contentType,
                  metadata: file.metadata,
                  etag: file.etag,
                  updated: file.updated.toISOString(),
                  generation: file.generation
                }
              ];
            },
            createReadStream: (streamOpts?: { start?: number; end?: number }) => {
              const file = this.files.get(fullKey);
              if (!file) {
                const stream = new Readable({
                  read() {
                    const err: any = new Error("Not Found");
                    err.code = 404;
                    this.destroy(err);
                  }
                });
                return stream;
              }
              let buf = file.buffer;
              if (streamOpts) {
                const start = streamOpts.start ?? 0;
                const end = streamOpts.end !== undefined ? streamOpts.end + 1 : undefined;
                buf = buf.subarray(start, end);
              }
              return Readable.from([buf]);
            },
            createWriteStream: (writeOpts?: any) => {
              const chunks: Buffer[] = [];
              const writable = new Writable({
                write(chunk, encoding, callback) {
                  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                  callback();
                }
              });

              writable.on("finish", () => {
                if (writeOpts?.preconditionOpts?.ifGenerationMatch === 0 && this.files.has(fullKey)) {
                  const err: any = new Error("Precondition Failed");
                  err.code = 412;
                  err.name = "PreconditionFailed";
                  writable.destroy(err);
                  return;
                }
                const combined = Buffer.concat(chunks);
                const etag = `"${Math.random().toString(36).slice(2)}"`;
                this.files.set(fullKey, {
                  buffer: combined,
                  contentType: writeOpts?.contentType || "application/octet-stream",
                  metadata: writeOpts?.metadata?.metadata,
                  etag,
                  generation: Date.now(),
                  updated: new Date()
                });
              });

              return writable;
            },
            delete: async (opts?: any) => {
              if (!this.files.has(fullKey) && !opts?.ignoreNotFound) {
                const err: any = new Error("Not Found");
                err.code = 404;
                throw err;
              }
              this.files.delete(fullKey);
            }
          };
        }
      };
    });

    await this.storage.init();
    await this.contract.setup();
  }

  @afterEach
  async afterEach() {
    await this.contract.teardown();
    await this.storage.stop();
    vi.restoreAllMocks();
  }

  @test
  async roundTripBufferAndString() {
    await this.contract.roundTripBufferAndString();
  }

  @test
  async roundTripStreamWithoutLength() {
    await this.contract.roundTripStreamWithoutLength();
  }

  @test
  async missingKeyThrowsNotFoundError() {
    await this.contract.missingKeyThrowsNotFoundError();
  }

  @test
  async rangeReadReturnsExactBytes() {
    await this.contract.rangeReadReturnsExactBytes();
  }

  @test
  async ifNotExistsRejectsExistingKey() {
    await this.contract.ifNotExistsRejectsExistingKey();
  }

  @test
  async metadataAndHeadContent() {
    await this.contract.metadataAndHeadContent();
  }

  @test
  async streamErrorDoesNotLeaveCorruptedFile() {
    await this.contract.streamErrorDoesNotLeaveCorruptedFile();
  }

  @test
  async endpointSelectionKeepsBucketAndKeyForAllOperations() {
    const endpoint = "http://127.0.0.1:4443";
    const url = `gcs://${TEST_BUCKET}/emulated/file.txt?endpoint=${encodeURIComponent(endpoint)}`;
    await this.storage.putContent(url, "emulated body");
    const stream = await this.storage.getContent(url);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    assert.strictEqual(Buffer.concat(chunks).toString(), "emulated body");
    assert.strictEqual((await this.storage.headContent(url))?.size, 13);
    await this.storage.deleteContent(url);
    assert.strictEqual(await this.storage.headContent(url), undefined);
    const bucketCalls = vi.mocked(this.storage.getStorageBucket).mock.calls;
    assert.ok(bucketCalls.every(([bucket, selected]) => bucket === TEST_BUCKET && selected === endpoint));
    assert.ok(!this.files.has(`${TEST_BUCKET}/emulated/file.txt`));
  }

  @test
  async credentialProfilesSelectIndependentGcsClientsForTransfers() {
    this.storage.parameters.credentialProfiles = {
      source: {
        projectId: "source-project",
        credentials: { client_email: "source@example.test", private_key: "source-key" }
      },
      destination: {
        projectId: "destination-project",
        credentials: { client_email: "destination@example.test", private_key: "destination-key" }
      }
    };
    const getRealBucket = Storage.prototype.getStorageBucket.bind(this.storage);
    this.storage.parameters.credentials = { client_email: "default@example.test", private_key: "default-key" };
    assert.strictEqual(
      (getRealBucket(TEST_BUCKET).storage as any).authClient.jsonContent.client_email,
      "default@example.test"
    );
    const source = getRealBucket(TEST_BUCKET, "http://127.0.0.1:4443", "source").storage;
    const destination = getRealBucket(TEST_BUCKET, "http://127.0.0.1:4443", "destination").storage;
    assert.notStrictEqual(source, destination);
    assert.strictEqual(getRealBucket(TEST_BUCKET, "http://127.0.0.1:4443", "source").storage, source);
    assert.strictEqual((source as any).authClient.jsonContent.client_email, "source@example.test");
    assert.strictEqual((destination as any).authClient.jsonContent.client_email, "destination@example.test");
    assert.strictEqual((destination as any).projectId, "destination-project");
    assert.strictEqual(
      (getRealBucket(TEST_BUCKET, undefined, "source").storage as any).authClient.jsonContent.client_email,
      "source@example.test"
    );
    const endpoint = "http://127.0.0.1:4443";
    const url = `gcs://${TEST_BUCKET}/profile.txt?credential=destination&endpoint=${encodeURIComponent(endpoint)}`;
    await putContent(url, "profile body");
    const read = await getContent(url);
    const chunks: Buffer[] = [];
    for await (const chunk of read) chunks.push(Buffer.from(chunk));
    assert.strictEqual(Buffer.concat(chunks).toString(), "profile body");
    await this.storage.headContent(url);
    await this.storage.deleteContent(url);
    assert.ok(
      vi
        .mocked(this.storage.getStorageBucket)
        .mock.calls.every(
          ([bucket, selected, profile]) => bucket === TEST_BUCKET && selected === endpoint && profile === "destination"
        )
    );
    assert.throws(() => getRealBucket(TEST_BUCKET, undefined, "missing"), ContentCredentialNotFoundError);
    this.storage.parameters.credentialProfiles = undefined;
    assert.throws(() => getRealBucket(TEST_BUCKET, undefined, "missing"), ContentCredentialNotFoundError);
    const inherited = getRealBucket(TEST_BUCKET, undefined, undefined).storage;
    assert.strictEqual((inherited as any).authClient.jsonContent.client_email, "default@example.test");
  }

  @test
  async defaultBucketUrlSupportsEveryOperationAndOpenEndedRange() {
    const url = "gs:///default-bucket.txt";
    const metrics = this.storage.metrics;
    (this.storage as any).metrics = undefined;
    try {
      await this.storage.putContent(url, "default bucket");
      const stream = await this.storage.getContent(url, { range: { start: 8 } });
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      assert.strictEqual(Buffer.concat(chunks).toString(), "bucket");
      const legacyStream = await this.storage.getContent({ key: "default-bucket.txt" });
      const legacyChunks: Buffer[] = [];
      for await (const chunk of legacyStream) legacyChunks.push(Buffer.from(chunk));
      assert.strictEqual(Buffer.concat(legacyChunks).toString(), "default bucket");
      assert.strictEqual((await this.storage.headContent(url))?.size, 14);
      await this.storage.deleteContent(url);
      assert.strictEqual(await this.storage.headContent(url), undefined);
    } finally {
      (this.storage as any).metrics = metrics;
    }
  }

  @test
  urlEndpointCreatesCachedGcsClientWithProtocolAndPort() {
    const getRealBucket = Storage.prototype.getStorageBucket.bind(this.storage);
    const first = getRealBucket(TEST_BUCKET, "http://127.0.0.1:4443");
    const again = getRealBucket(TEST_BUCKET, "http://127.0.0.1:4443");
    const secure = getRealBucket(TEST_BUCKET, "https://storage.example.com:8443");
    assert.strictEqual(first.storage, again.storage);
    assert.strictEqual((first.storage as any).baseUrl, "http://127.0.0.1:4443/storage/v1");
    assert.strictEqual((secure.storage as any).baseUrl, "https://storage.example.com:8443/storage/v1");
    assert.notStrictEqual(first.storage, secure.storage);
    this.storage.parameters.endpoint = "https://storage.example.com:8443";
    assert.strictEqual(
      (getRealBucket(TEST_BUCKET, "https://storage.example.com:8443").storage as any).baseUrl,
      "https://storage.example.com:8443/storage/v1"
    );
    const originalEmulator = process.env.STORAGE_EMULATOR_HOST;
    try {
      process.env.STORAGE_EMULATOR_HOST = "http://other-emulator:5555";
      const selected = getRealBucket(TEST_BUCKET, "http://127.0.0.1:4444");
      assert.strictEqual((selected.storage as any).baseUrl, "http://127.0.0.1:4444/storage/v1");
    } finally {
      if (originalEmulator === undefined) delete process.env.STORAGE_EMULATOR_HOST;
      else process.env.STORAGE_EMULATOR_HOST = originalEmulator;
    }
  }

  @test
  async emulatorErrorsPropagateAndPreconditionRaceMapsToContentExists() {
    const url = `gs://${TEST_BUCKET}/error?endpoint=http%3A%2F%2Flocalhost%3A4443`;
    const bucket = vi.mocked(this.storage.getStorageBucket);
    bucket.mockReturnValueOnce(<any>{
      file: () => ({
        exists: async () => {
          throw new Error("read failed");
        }
      })
    });
    await assert.rejects(this.storage.getContent(url), /read failed/);
    bucket.mockReturnValueOnce(<any>{
      file: () => ({
        getMetadata: async () => {
          throw new Error("head failed");
        }
      })
    });
    await assert.rejects(this.storage.headContent(url), /head failed/);
    bucket.mockReturnValueOnce(<any>{
      file: () => ({
        delete: async () => {
          throw new Error("delete failed");
        }
      })
    });
    await assert.rejects(this.storage.deleteContent(url), /delete failed/);
    bucket.mockReturnValueOnce(<any>{
      file: () => ({
        exists: async () => [false],
        createWriteStream: () =>
          new Writable({
            write(_chunk, _encoding, callback) {
              callback(Object.assign(new Error("precondition"), { code: 412 }));
            }
          })
      })
    });
    await assert.rejects(this.storage.putContent(url, "body", { ifNotExists: true }), ContentExistsError);
  }

  @test
  async legacyGetContentWithObject() {
    await this.storage.putContent(`gs://${TEST_BUCKET}/legacy.json`, JSON.stringify({ ok: true }), {
      contentType: "application/json"
    });

    const stream = await this.storage.getContent({ bucket: TEST_BUCKET, key: "legacy.json" });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    assert.deepStrictEqual(JSON.parse(Buffer.concat(chunks).toString("utf-8")), { ok: true });
  }

  @test
  async gcsFinderParsesGsAndGcsSchemes() {
    const finder = new GCSFinder();
    assert.deepStrictEqual(finder.getInfo("gs://my-bucket/path/to/key.txt"), {
      bucket: "my-bucket",
      key: "path/to/key.txt"
    });
    assert.deepStrictEqual(finder.getInfo("gcs://my-bucket/path/to/key.txt"), {
      bucket: "my-bucket",
      key: "path/to/key.txt"
    });
    assert.throws(() => finder.getInfo("s3://bucket/key"), /Invalid protocol/);
  }

  @test
  async resolvedViaContentStoragesForBothGsAndGcs() {
    assert.strictEqual(ContentStorages.resolve(`gs://${TEST_BUCKET}/test.bin`), this.storage);
    assert.strictEqual(ContentStorages.resolve(`gcs://${TEST_BUCKET}/test.bin`), this.storage);
  }
}
