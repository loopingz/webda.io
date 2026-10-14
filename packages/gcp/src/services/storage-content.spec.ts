import {
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
