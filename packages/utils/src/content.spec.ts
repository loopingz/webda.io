import * as assert from "assert";
import { promises as fsPromises } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, suite, test } from "@webda/test";
import {
  ContentExistsError,
  ContentNotFoundError,
  ContentStorageNotFoundError,
  ContentStorages,
  FileContentStorage,
  MemoryContentStorage,
  getContent,
  parseContentUrl,
  putContent
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
