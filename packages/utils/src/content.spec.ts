import * as assert from "assert";
import { promises as fsPromises } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, suite, test } from "@webda/test";
import {
  ContentExistsError,
  ContentCredentialNotFoundError,
  ContentNotFoundError,
  ContentStorageNotFoundError,
  ContentStorages,
  FileContentStorage,
  MemoryContentStorage,
  getContent,
  lookupMimeType,
  parseContentUrl,
  putContent,
  toBuffer,
  toReadable
} from "./content.js";
import { ContentStorageContract } from "./content.contract.js";
import { streamToBuffer } from "./stream.js";

@suite
class ContentUrlParsingTest {
  @test
  parsesS3Urls() {
    assert.deepStrictEqual(parseContentUrl("s3://my-bucket/path/to/key.bin"), {
      scheme: "s3",
      bucket: "my-bucket",
      key: "path/to/key.bin"
    });

    assert.deepStrictEqual(parseContentUrl("s3:///default/bucket/key.bin", "fallback-bucket"), {
      scheme: "s3",
      bucket: "fallback-bucket",
      key: "default/bucket/key.bin"
    });

    assert.deepStrictEqual(parseContentUrl("s3:key-without-bucket.bin", "fallback-bucket"), {
      scheme: "s3",
      bucket: "fallback-bucket",
      key: "key-without-bucket.bin"
    });
  }

  @test
  parsesGoogleCloudStorageUrls() {
    assert.deepStrictEqual(parseContentUrl("gs://gcs-bucket/export/data.json.gz"), {
      scheme: "gs",
      bucket: "gcs-bucket",
      key: "export/data.json.gz"
    });

    assert.deepStrictEqual(parseContentUrl("gcs://gcs-bucket/export/data.json.gz"), {
      scheme: "gcs",
      bucket: "gcs-bucket",
      key: "export/data.json.gz"
    });
  }

  @test
  parsesEndpointSelectionWithoutChangingBucketOrKey() {
    for (const scheme of ["s3", "gs", "gcs"]) {
      const endpoint = "http://127.0.0.1:9000";
      const url = `${scheme}://my-bucket/folder/file%20one.txt?endpoint=${encodeURIComponent(endpoint)}`;
      assert.deepStrictEqual(parseContentUrl(url), {
        scheme,
        bucket: "my-bucket",
        key: "folder/file one.txt",
        endpoint
      });
      assert.deepStrictEqual(
        parseContentUrl(`${scheme}:///file.txt?endpoint=https%3A%2F%2Fstorage.example.com`, "default"),
        {
          scheme,
          bucket: "default",
          key: "file.txt",
          endpoint: "https://storage.example.com"
        }
      );
    }
  }

  @test
  parsesCredentialProfileWithOrWithoutEndpoint() {
    assert.deepStrictEqual(parseContentUrl("s3://source/key?credential=source-account"), {
      scheme: "s3",
      bucket: "source",
      key: "key",
      credential: "source-account"
    });
    assert.deepStrictEqual(
      parseContentUrl("gs://target/key?endpoint=http%3A%2F%2Flocalhost%3A4443&credential=destination"),
      {
        scheme: "gs",
        bucket: "target",
        key: "key",
        endpoint: "http://localhost:4443",
        credential: "destination"
      }
    );
    assert.deepStrictEqual(
      parseContentUrl("gcs://target/key?credential=destination&endpoint=https%3A%2F%2Fexample.test"),
      {
        scheme: "gcs",
        bucket: "target",
        key: "key",
        endpoint: "https://example.test",
        credential: "destination"
      }
    );
  }

  @test
  rejectsInvalidEndpointSelection() {
    for (const endpoint of [
      "",
      "localhost:9000",
      "ftp://localhost",
      "http://user:pass@localhost",
      "http://localhost/?secret=1",
      "http://localhost/#part"
    ]) {
      assert.throws(
        () => parseContentUrl(`s3://bucket/key?endpoint=${encodeURIComponent(endpoint)}`),
        /Content endpoint/
      );
    }
    assert.throws(
      () => parseContentUrl("gs://bucket/key?endpoint=http://localhost&endpoint=http://other"),
      /one endpoint/
    );
    assert.throws(() => parseContentUrl("s3://bucket/key?endpoint=http://localhost&other=1"), /one endpoint/);
    assert.throws(() => parseContentUrl("s3://bucket/key?credential=one&credential=two"), /one credential/);
    assert.throws(() => parseContentUrl("s3://bucket/key?credential="), /must not be empty/);
    assert.deepStrictEqual(parseContentUrl("s3://bucket/key?literal"), {
      scheme: "s3",
      bucket: "bucket",
      key: "key?literal"
    });
  }

  @test
  parsesFilesystemAndBarePaths() {
    assert.deepStrictEqual(parseContentUrl("file:///var/data/test.txt"), {
      scheme: "file",
      bucket: undefined,
      key: "/var/data/test.txt"
    });

    assert.deepStrictEqual(parseContentUrl("/var/data/test.txt"), {
      scheme: "file",
      bucket: undefined,
      key: "/var/data/test.txt"
    });

    assert.deepStrictEqual(parseContentUrl("./relative/test.txt"), {
      scheme: "file",
      bucket: undefined,
      key: "./relative/test.txt"
    });
    assert.deepStrictEqual(parseContentUrl("file:relative.txt"), {
      scheme: "file",
      bucket: undefined,
      key: "relative.txt"
    });
    assert.deepStrictEqual(parseContentUrl("C:\\temp\\file.txt"), {
      scheme: "file",
      bucket: undefined,
      key: "C:\\temp\\file.txt"
    });
  }

  @test
  parsesKeysWithSpacesPercentAndUnicode() {
    assert.deepStrictEqual(parseContentUrl("s3://bucket/folder%20with%20spaces/файл%201.txt"), {
      scheme: "s3",
      bucket: "bucket",
      key: "folder with spaces/файл 1.txt"
    });

    assert.deepStrictEqual(parseContentUrl("s3://bucket/folder with spaces/donnée.csv"), {
      scheme: "s3",
      bucket: "bucket",
      key: "folder with spaces/donnée.csv"
    });
  }

  @test
  parsesMemoryAndUnknownSchemes() {
    assert.deepStrictEqual(parseContentUrl("memory://mem-bucket/item1"), {
      scheme: "memory",
      bucket: "mem-bucket",
      key: "item1"
    });

    assert.deepStrictEqual(parseContentUrl("unknown://host/key"), {
      scheme: "unknown",
      bucket: "host",
      key: "key"
    });
  }

  @test
  throwsOnEmptyUrl() {
    assert.throws(() => parseContentUrl(""), /URL must not be empty/);
    const missing = new ContentCredentialNotFoundError("missing");
    assert.strictEqual(missing.code, "CONTENT_CREDENTIAL_NOT_FOUND");
    assert.strictEqual(missing.name, "ContentCredentialNotFoundError");
  }

  @test
  async convertsSupportedBodiesAndRejectsInvalidOnes() {
    assert.strictEqual(lookupMimeType("unknown.extension"), "application/octet-stream");
    assert.deepStrictEqual(await toBuffer(new Uint8Array([1, 2])), Buffer.from([1, 2]));
    assert.deepStrictEqual(await toBuffer(toReadable("text")), Buffer.from("text"));
    assert.deepStrictEqual(await toBuffer(Buffer.from("text")), Buffer.from("text"));
    assert.throws(() => toReadable(5 as any), /Invalid ContentBody/);
    await assert.rejects(toBuffer(5 as any), /Invalid ContentBody/);
    assert.deepStrictEqual(parseContentUrl("s3://bucket"), { scheme: "s3", bucket: "bucket", key: "" });
    assert.deepStrictEqual(parseContentUrl("s3://", "fallback"), { scheme: "s3", bucket: "fallback", key: "" });
  }
}

@suite
class ContentStoragesRegistryTest {
  beforeEach() {
    ContentStorages.clear();
  }

  afterEach() {
    ContentStorages.clear();
  }

  @test
  resolvesBucketBoundOverDefaultOverFirst() {
    const memFirst = new MemoryContentStorage();
    const memDefault = new MemoryContentStorage();
    const memBucket = new MemoryContentStorage();

    ContentStorages.register(memFirst);
    ContentStorages.register(memDefault, { default: true });
    ContentStorages.register(memBucket, { bucket: "special-bucket" });

    // 1. Bucket match
    assert.strictEqual(ContentStorages.resolve("memory://special-bucket/foo"), memBucket);

    // 2. Default match for other buckets
    assert.strictEqual(ContentStorages.resolve("memory://other-bucket/foo"), memDefault);

    // 3. Fallback when unregistering default
    ContentStorages.unregister(memDefault);
    assert.strictEqual(ContentStorages.resolve("memory://other-bucket/foo"), memFirst);

    // 4. Unknown scheme throws ContentStorageNotFoundError
    assert.throws(
      () => ContentStorages.resolve("azure://container/key"),
      (err: any) => err instanceof ContentStorageNotFoundError && err.code === "CONTENT_STORAGE_NOT_FOUND"
    );
  }

  @test
  endpointDoesNotBypassBucketProviderSelection() {
    class S3MemoryContentStorage extends MemoryContentStorage {
      override readonly schemes = ["s3"];
    }
    const first = new S3MemoryContentStorage();
    const bucket = new S3MemoryContentStorage();
    ContentStorages.register(first, { default: true });
    ContentStorages.register(bucket, { bucket: "special" });
    assert.strictEqual(ContentStorages.resolve("s3://special/key?endpoint=http://localhost:9000"), bucket);
    assert.strictEqual(ContentStorages.resolve("s3://other/key?endpoint=http://localhost:9000"), first);
  }

  @test
  freeFunctionsGetAndPutContent() {
    const mem = new MemoryContentStorage();
    ContentStorages.register(mem, { default: true });

    return (async () => {
      const putRes = await putContent("memory://bucket/free-test.txt", "free content", {
        contentType: "text/plain"
      });
      assert.strictEqual(putRes.size, 12);

      const stream = await getContent("memory://bucket/free-test.txt");
      const buf = await streamToBuffer(stream);
      assert.strictEqual(buf.toString("utf-8"), "free content");
    })();
  }

  @test
  async registryAndDeletionLifecycle() {
    const first = new MemoryContentStorage();
    const second = new MemoryContentStorage();
    ContentStorages.register(first, { bucket: "same" });
    ContentStorages.register(second, { bucket: "same" });
    assert.strictEqual(ContentStorages.resolve("memory://same/key"), first);
    assert.ok(ContentStorages.resolve("file:///missing") instanceof FileContentStorage);
    await first.putContent("memory://same/key", "value");
    await first.deleteContent("memory://same/key");
    assert.strictEqual(await first.headContent("memory://same/key"), undefined);
    await first.putContent("memory://same/key", "value");
    first.clear();
    assert.strictEqual(await first.headContent("memory://same/key"), undefined);
    await first.putContent("memory:key", "value", { metadata: { source: "test" } });
    assert.deepStrictEqual((await first.headContent("memory:key"))?.metadata, { source: "test" });
    const ranged = await first.getContent("memory:key", { range: { start: 2 } });
    assert.strictEqual((await toBuffer(ranged)).toString(), "lue");
  }
}

@suite
class MemoryContentStorageContractTest {
  private contract = ContentStorageContract(async () => {
    const storage = new MemoryContentStorage();
    return {
      storage,
      baseUrl: "memory://test-bucket"
    };
  })();

  @beforeEach
  async before() {
    await this.contract.setup();
  }

  @afterEach
  async after() {
    await this.contract.teardown();
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
}

@suite
class FileContentStorageContractTest {
  private testDir = join(tmpdir(), `webda-file-content-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  private contract = ContentStorageContract(async () => {
    await fsPromises.mkdir(this.testDir, { recursive: true });
    const storage = new FileContentStorage();
    return {
      storage,
      baseUrl: `file://${this.testDir}`,
      cleanup: async () => {
        try {
          await fsPromises.rm(this.testDir, { recursive: true, force: true });
        } catch {}
      }
    };
  })();

  @beforeEach
  async before() {
    await this.contract.setup();
  }

  @afterEach
  async after() {
    await this.contract.teardown();
  }

  @test
  async roundTripBufferAndString() {
    await this.contract.roundTripBufferAndString();
  }

  @test
  async deleteContentRemovesAnExistingFile() {
    const storage = new FileContentStorage();
    const url = `file://${join(this.testDir, "delete.txt")}`;
    await storage.putContent(url, "delete me");
    await storage.deleteContent(url);
    await storage.deleteContent(url);
    assert.strictEqual(await storage.headContent(url), undefined);
  }

  @test
  async openEndedRangeReadsToEnd() {
    const storage = new FileContentStorage();
    const url = `file://${join(this.testDir, "range.txt")}`;
    await storage.putContent(url, "abcdef");
    assert.strictEqual((await toBuffer(await storage.getContent(url, { range: { start: 2 } }))).toString(), "cdef");
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
}
