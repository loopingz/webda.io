import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3,
  UploadPartCommand
} from "@aws-sdk/client-s3";
import {
  ContentExistsError,
  ContentCredentialNotFoundError,
  ContentNotFoundError,
  ContentStorages,
  getContent,
  putContent,
  toReadable
} from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { ContentStorageContract } from "@webda/utils";
import { afterEach, beforeEach, suite, test } from "@webda/test";
import * as assert from "assert";
import { mockClient } from "aws-sdk-client-mock";
import { Readable } from "node:stream";
import { vi } from "vitest";
import { S3Binary, S3BinaryParameters } from "./s3binary.service.js";

const TEST_BUCKET = "unit-content-bucket";

interface MockObject {
  buffer: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
  etag: string;
  lastModified: Date;
}

@suite
class S3BinaryContentStorageTest extends WebdaApplicationTest {
  private mock = mockClient(S3);
  private storageMap = new Map<string, MockObject>();
  private multipartUploads = new Map<
    string,
    { key: string; bucket: string; parts: Map<number, Buffer>; metadata?: Record<string, string>; contentType: string }
  >();
  private s3Binary: S3Binary;

  private contract = ContentStorageContract(async () => {
    return {
      storage: this.s3Binary,
      baseUrl: `s3://${TEST_BUCKET}`,
      isCloud: true
    };
  })();

  @beforeEach
  async beforeEach() {
    await super.beforeEach();
    this.storageMap.clear();
    this.multipartUploads.clear();
    this.mock.reset();

    // Mock GetObjectCommand
    this.mock.on(GetObjectCommand).callsFake(async params => {
      const fullKey = `${params.Bucket}/${params.Key}`;
      const obj = this.storageMap.get(fullKey);
      if (!obj) {
        const err: any = new Error("The specified key does not exist.");
        err.name = "NoSuchKey";
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      let buf = obj.buffer;
      if (params.Range) {
        const match = params.Range.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) + 1 : undefined;
          buf = buf.subarray(start, end);
        }
      }
      return {
        Body: Readable.from([buf]),
        ContentLength: buf.length,
        ContentType: obj.contentType,
        ETag: obj.etag,
        Metadata: obj.metadata,
        LastModified: obj.lastModified
      };
    });

    // Mock HeadObjectCommand
    this.mock.on(HeadObjectCommand).callsFake(async params => {
      const fullKey = `${params.Bucket}/${params.Key}`;
      const obj = this.storageMap.get(fullKey);
      if (!obj) {
        const err: any = new Error("Not Found");
        err.name = "NotFound";
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      return {
        ContentLength: obj.buffer.length,
        ContentType: obj.contentType,
        ETag: obj.etag,
        Metadata: obj.metadata,
        LastModified: obj.lastModified
      };
    });

    // Mock DeleteObjectCommand
    this.mock.on(DeleteObjectCommand).callsFake(async params => {
      const fullKey = `${params.Bucket}/${params.Key}`;
      this.storageMap.delete(fullKey);
      return {};
    });

    // Mock PutObjectCommand
    this.mock.on(PutObjectCommand).callsFake(async params => {
      const fullKey = `${params.Bucket}/${params.Key}`;
      if (params.IfNoneMatch === "*" && this.storageMap.has(fullKey)) {
        const err: any = new Error("Precondition Failed");
        err.name = "PreconditionFailed";
        err.$metadata = { httpStatusCode: 412 };
        throw err;
      }

      let buf: Buffer;
      if (Buffer.isBuffer(params.Body)) {
        buf = params.Body;
      } else if (typeof params.Body === "string") {
        buf = Buffer.from(params.Body, "utf-8");
      } else if (params.Body instanceof Readable) {
        const chunks: Buffer[] = [];
        for await (const chunk of params.Body) {
          chunks.push(Buffer.from(chunk));
        }
        buf = Buffer.concat(chunks);
      } else {
        buf = Buffer.from(params.Body as any);
      }

      const etag = `"${Math.random().toString(36).slice(2)}"`;
      this.storageMap.set(fullKey, {
        buffer: buf,
        contentType: params.ContentType || "application/octet-stream",
        metadata: params.Metadata,
        etag,
        lastModified: new Date()
      });
      return { ETag: etag };
    });

    // Mock Multipart Uploads for @aws-sdk/lib-storage Upload
    this.mock.on(CreateMultipartUploadCommand).callsFake(async params => {
      const fullKey = `${params.Bucket}/${params.Key}`;
      if (params.IfNoneMatch === "*" && this.storageMap.has(fullKey)) {
        const err: any = new Error("Precondition Failed");
        err.name = "PreconditionFailed";
        err.$metadata = { httpStatusCode: 412 };
        throw err;
      }
      const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.multipartUploads.set(uploadId, {
        key: params.Key,
        bucket: params.Bucket,
        parts: new Map(),
        metadata: params.Metadata,
        contentType: params.ContentType || "application/octet-stream"
      });
      return { UploadId: uploadId };
    });

    this.mock.on(UploadPartCommand).callsFake(async params => {
      const up = this.multipartUploads.get(params.UploadId);
      if (!up) {
        throw new Error("Upload not found");
      }
      let buf: Buffer;
      if (Buffer.isBuffer(params.Body)) {
        buf = params.Body;
      } else if (typeof params.Body === "string") {
        buf = Buffer.from(params.Body, "utf-8");
      } else if (params.Body instanceof Readable) {
        const chunks: Buffer[] = [];
        for await (const chunk of params.Body) {
          chunks.push(Buffer.from(chunk));
        }
        buf = Buffer.concat(chunks);
      } else {
        buf = Buffer.from(params.Body as any);
      }
      up.parts.set(params.PartNumber, buf);
      return { ETag: `"part-${params.PartNumber}"` };
    });

    this.mock.on(CompleteMultipartUploadCommand).callsFake(async params => {
      const up = this.multipartUploads.get(params.UploadId);
      if (!up) {
        throw new Error("Upload not found");
      }
      const sortedPartNumbers = Array.from(up.parts.keys()).sort((a, b) => a - b);
      const parts = sortedPartNumbers.map(n => up.parts.get(n)!);
      const combined = Buffer.concat(parts);
      const fullKey = `${up.bucket}/${up.key}`;
      const etag = `"${Math.random().toString(36).slice(2)}"`;
      this.storageMap.set(fullKey, {
        buffer: combined,
        contentType: up.contentType,
        metadata: up.metadata,
        etag,
        lastModified: new Date()
      });
      this.multipartUploads.delete(params.UploadId);
      return {
        Bucket: up.bucket,
        Key: up.key,
        ETag: etag
      };
    });

    this.mock.on(AbortMultipartUploadCommand).callsFake(async params => {
      this.multipartUploads.delete(params.UploadId);
      return {};
    });

    this.s3Binary = this.registerService(
      new S3Binary(
        "s3test",
        new S3BinaryParameters().load({
          bucket: TEST_BUCKET,
          region: "us-east-1"
        })
      )
    ).resolve();
    await this.s3Binary.init();
    await this.contract.setup();
  }

  @afterEach
  async afterEach() {
    await this.contract.teardown();
    await this.s3Binary.stop();
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
  async endpointSelectionUsesProviderCredentialsAndKeepsObjectKey() {
    const endpoint = "http://127.0.0.1:9000";
    const url = `s3://${TEST_BUCKET}/endpoint/object.txt?endpoint=${encodeURIComponent(endpoint)}`;
    (this.s3Binary as any)._s3Config.credentials = {
      accessKeyId: "provider-key",
      secretAccessKey: "provider-secret"
    };
    const selected = (this.s3Binary as any).getContentClient(endpoint) as S3;
    assert.notStrictEqual(selected, this.s3Binary._s3);
    assert.strictEqual((this.s3Binary as any).getContentClient(endpoint), selected);
    assert.strictEqual((this.s3Binary as any).getContentClient(), this.s3Binary._s3);
    assert.strictEqual((await selected.config.endpoint()).hostname, "127.0.0.1");
    assert.strictEqual((await selected.config.endpoint()).port, 9000);
    assert.strictEqual(selected.config.forcePathStyle, true);
    assert.strictEqual((await selected.config.credentials()).accessKeyId, "provider-key");
    const getClient = vi.spyOn(this.s3Binary as any, "getContentClient");
    await this.s3Binary.putContent(url, "endpoint body", { ifNotExists: true });
    const stream = await this.s3Binary.getContent(url);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    assert.strictEqual(Buffer.concat(chunks).toString(), "endpoint body");
    assert.strictEqual((await this.s3Binary.headContent(url))?.size, 13);
    await this.s3Binary.deleteContent(url);
    assert.strictEqual(await this.s3Binary.headContent(url), undefined);
    assert.ok(getClient.mock.calls.every(([value]) => value === endpoint));
    assert.ok(this.storageMap.has(`${TEST_BUCKET}/endpoint/object.txt`) === false);
  }

  @test
  async credentialProfilesSelectIndependentS3ClientsForTransfers() {
    this.s3Binary.parameters.credentialProfiles = {
      source: { accessKeyId: "source-key", secretAccessKey: "source-secret" },
      destination: { accessKeyId: "destination-key", secretAccessKey: "destination-secret" }
    };
    const endpoint = "http://127.0.0.1:9000";
    const source = (this.s3Binary as any).getContentClient(endpoint, "source") as S3;
    const destination = (this.s3Binary as any).getContentClient(endpoint, "destination") as S3;
    assert.notStrictEqual(source, destination);
    assert.strictEqual((this.s3Binary as any).getContentClient(endpoint, "source"), source);
    assert.strictEqual((await source.config.credentials()).accessKeyId, "source-key");
    assert.strictEqual((await destination.config.credentials()).accessKeyId, "destination-key");
    const url = `s3://${TEST_BUCKET}/transfer.txt?credential=destination&endpoint=${encodeURIComponent(endpoint)}`;
    const getClient = vi.spyOn(this.s3Binary as any, "getContentClient");
    await putContent(url, "transfer body");
    const stream = await getContent(url);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    assert.strictEqual(Buffer.concat(chunks).toString(), "transfer body");
    await this.s3Binary.headContent(url);
    await this.s3Binary.deleteContent(url);
    assert.ok(
      getClient.mock.calls.every(
        ([selectedEndpoint, profile]) => selectedEndpoint === endpoint && profile === "destination"
      )
    );
    assert.strictEqual(
      (await ((this.s3Binary as any).getContentClient(undefined, "source") as S3).config.credentials()).accessKeyId,
      "source-key"
    );
    await assert.rejects(
      this.s3Binary.getContent(`s3://${TEST_BUCKET}/x?credential=missing`),
      ContentCredentialNotFoundError
    );
  }

  @test
  async endpointPreflightPropagatesUnexpectedErrors() {
    this.mock.on(HeadObjectCommand).rejects(new Error("endpoint unavailable"));
    const url = `s3://${TEST_BUCKET}/key?endpoint=http%3A%2F%2Flocalhost%3A9000`;
    await assert.rejects(this.s3Binary.putContent(url, "body", { ifNotExists: true }), /endpoint unavailable/);
  }

  @test
  async unexpectedS3ReadAndHeadErrorsPropagate() {
    const url = `s3://${TEST_BUCKET}/error?endpoint=http%3A%2F%2Flocalhost%3A9000`;
    this.mock.on(GetObjectCommand).rejects(new Error("read failed"));
    await assert.rejects(this.s3Binary.getContent(url), /read failed/);
    this.mock.on(HeadObjectCommand).rejects(new Error("head failed"));
    await assert.rejects(this.s3Binary.headContent(url), /head failed/);
  }

  @test
  async uploadPreconditionRaceMapsToContentExists() {
    const url = `s3://${TEST_BUCKET}/race?endpoint=http%3A%2F%2Flocalhost%3A9000`;
    this.mock.on(PutObjectCommand).rejects(Object.assign(new Error("precondition"), { name: "PreconditionFailed" }));
    await assert.rejects(this.s3Binary.putContent(url, "body"), ContentExistsError);
  }

  @test
  async deprecatedGetObjectAndPutObject() {
    await this.s3Binary.putObject("legacy.txt", "legacy body", { env: "prod" });
    const stream = await this.s3Binary.getObject("legacy.txt");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    assert.strictEqual(Buffer.concat(chunks).toString("utf-8"), "legacy body");
  }

  @test
  async resolvedViaContentStorages() {
    // Should be registered in ContentStorages for TEST_BUCKET
    const resolved = ContentStorages.resolve(`s3://${TEST_BUCKET}/foo.txt`);
    assert.strictEqual(resolved, this.s3Binary);
  }
}
