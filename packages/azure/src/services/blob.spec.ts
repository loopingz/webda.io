import { suite, test } from "@webda/test";
import { MemoryBinaryFile, SecretString, useDynamicService, useModel } from "@webda/core";
import { ContentExistsError, ContentNotFoundError } from "@webda/utils";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { expect, vi } from "vitest";
import { addAzureModda, AzureTest } from "../../test/fixture.js";
import { AzureBlobBinary, AzureBlobBinaryParameters } from "./blob.service.js";

const sdk = vi.hoisted(() => ({
  blobs: new Map<string, { body: Buffer; metadata: Record<string, string>; contentType?: string; etag: string }>(),
  sas: vi.fn(() => ({ toString: () => "sig=test" })),
  delegation: vi.fn(async () => ({})),
  create: vi.fn(async () => {}),
  downloads: vi.fn(),
  pipelines: [] as any[],
  version: 0
}));
vi.mock("@azure/storage-blob", () => {
  class SharedKey {}
  const blob = (key: string) => ({
    url: `https://test.blob.core.windows.net/${key}`,
    async uploadStream(stream, _size, _concurrency, options) {
      if (options.conditions?.ifNoneMatch && sdk.blobs.has(key)) throw { statusCode: 412 };
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const value = {
        body: Buffer.concat(chunks),
        metadata: Object.fromEntries(
          Object.entries(options.metadata ?? {}).map(([name, value]) => [name.toLowerCase(), value])
        ) as Record<string, string>,
        contentType: options.blobHTTPHeaders.blobContentType,
        etag: String(++sdk.version)
      };
      sdk.blobs.set(key, value);
      return { etag: value.etag };
    },
    async download(start = 0, count, options) {
      sdk.downloads(start, count, options);
      const value = sdk.blobs.get(key);
      if (!value) throw { statusCode: 404 };
      if (options?.conditions?.ifMatch && options.conditions.ifMatch !== value.etag) throw { statusCode: 412 };
      return {
        readableStreamBody: Readable.from([
          value.body.subarray(start, count === undefined ? undefined : start + count)
        ]),
        etag: value.etag
      };
    },
    async getProperties() {
      const value = sdk.blobs.get(key);
      if (!value) throw { statusCode: 404 };
      return {
        contentLength: value.body.length,
        contentType: value.contentType,
        metadata: value.metadata,
        etag: value.etag
      };
    },
    async delete(options) {
      if (options?.conditions?.ifMatch && options.conditions.ifMatch !== sdk.blobs.get(key)?.etag)
        throw { statusCode: 412 };
      sdk.blobs.delete(key);
    },
    async deleteIfExists() {
      sdk.blobs.delete(key);
    }
  });
  return {
    StorageSharedKeyCredential: SharedKey,
    BlobSASPermissions: { parse: value => value },
    generateBlobSASQueryParameters: sdk.sas,
    newPipeline: credential => {
      const pipeline = { credential, factories: [] };
      sdk.pipelines.push(pipeline);
      return pipeline;
    },
    BlobServiceClient: class {
      credential: any;
      accountName = "test";
      url: string;
      constructor(endpoint, credential) {
        this.url = endpoint;
        this.credential = credential?.credential ?? credential;
      }
      static fromConnectionString() {
        return new this("", new SharedKey());
      }
      getUserDelegationKey = sdk.delegation;
      getContainerClient(container) {
        return {
          createIfNotExists: sdk.create,
          getBlockBlobClient: key => blob(`${container}/${key}`),
          getBlobClient: key => blob(`${container}/${key}`),
          async *listBlobsFlat(options) {
            for (const key of sdk.blobs.keys())
              if (key.startsWith(`${container}/${options.prefix}`)) yield { name: key.slice(container.length + 1) };
          }
        };
      }
    }
  };
});

const buffer = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};
const hashes = (body: string) => ({
  hash: createHash("md5").update(body).digest("hex"),
  challenge: createHash("md5").update("WEBDA").update(body).digest("hex")
});

@suite
class BlobTest extends AzureTest {
  async tweakApp(app) {
    await super.tweakApp(app);
    addAzureModda(app, "Test/Blob", AzureBlobBinary, AzureBlobBinaryParameters);
    Object.assign(app.getCurrentConfiguration().services, {
      Blob: {
        type: "Test/Blob",
        account: "test",
        container: "files",
        prefix: "tests",
        createContainer: true,
        models: { "WebdaTest/Task": ["images", "other"] }
      },
      Shared: {
        type: "Test/Blob",
        connectionString: new SecretString("test", "test"),
        endpoint: "http://localhost:10000/test",
        container: "shared",
        contentStorage: { register: false }
      }
    });
  }

  @test async contentAndSignatures() {
    const service = useDynamicService<AzureBlobBinary>("Blob");
    expect(sdk.create).toHaveBeenCalled();
    await service.putContent("azure://files/content", "abcdef", {
      contentType: "text/plain",
      metadata: { test: "yes" }
    });
    expect(
      (await buffer(await service.getContent("azure://files/content", { range: { start: 1, end: 3 } }))).toString()
    ).toBe("bcd");
    expect(await service.headContent("azure://files/content")).toMatchObject({ size: 6, metadata: { test: "yes" } });
    await expect(service.putContent("azure://files/content", "replace", { ifNotExists: true })).rejects.toBeInstanceOf(
      ContentExistsError
    );
    await service.deleteContent("azure://files/content");
    expect(await service.headContent("azure://files/content")).toBeUndefined();
    await expect(service.getContent("azure://files/content")).rejects.toBeInstanceOf(ContentNotFoundError);
    await expect(service.getContent("azure://files/content?endpoint=https%3A%2F%2Fevil.example")).rejects.toThrow(
      "configured Azure"
    );
    const hash = hashes("file").hash;
    expect(await service.getSignedUrlFromMap({ hash } as any, 60, {} as any)).toContain("sig=test");
    expect(sdk.delegation).toHaveBeenCalled();
    const shared = useDynamicService<AzureBlobBinary>("Shared");
    sdk.delegation.mockClear();
    await shared.getSignedUrl("content");
    expect(sdk.delegation).not.toHaveBeenCalled();
    for (const expiry of [-1, Infinity, 604800])
      await expect(shared.getSignedUrl("content", "r", expiry)).rejects.toThrow("SAS expiry");
    await expect(service._get({ hash: "../bad" } as any)).rejects.toThrow("Invalid binary hash");
  }

  @test async verifiesBeforeAttachAndPreventsCanonicalOverwrite() {
    const service = useDynamicService<AzureBlobBinary>("Blob");
    const owner = new (useModel("WebdaTest/Task"))({ uuid: "owner" }) as any;
    const uploaded = vi.spyOn(service, "uploadSuccess").mockResolvedValue(undefined);
    const info = { ...hashes("verified"), name: "test.txt", mimetype: "text/plain", size: 8, metadata: {} };
    const upload = await service.putRedirectUrl(owner, "images", info);
    expect(upload?.headers["x-ms-blob-type"]).toBe("BlockBlob");
    expect(uploaded).not.toHaveBeenCalled();
    expect(sdk.sas.mock.calls.at(-1)![0].permissions).toBe("c");
    await expect(service.completeUpload(owner, "images", info.hash)).rejects.toThrow("Upload not found");
    const staging = new URL(upload!.url).pathname.slice(1);
    sdk.blobs.set(staging, { body: Buffer.from("verified"), metadata: {}, etag: "stage" });
    await service.completeUpload(owner, "images", info.hash);
    expect(uploaded).toHaveBeenCalledWith(owner, "images", expect.objectContaining({ size: 8, hash: info.hash }));
    expect(sdk.blobs.get(`files/tests/${info.hash}/data`)?.body.toString()).toBe("verified");
    expect(sdk.blobs.has(staging)).toBe(false);
    expect(await service.getUsageCount(info.hash)).toBe(1);
    expect(await service.putRedirectUrl(owner, "other", info)).toBeUndefined();
    expect(await service.getUsageCount(info.hash)).toBe(2);
    uploaded.mockClear();
    const bad = await service.putRedirectUrl(owner, "images", { ...info, challenge: "0".repeat(32) });
    expect(bad).toBeDefined();
    sdk.blobs.set(new URL(bad!.url).pathname.slice(1), { body: Buffer.from("verified"), metadata: {}, etag: "bad" });
    await expect(service.completeUpload(owner, "images", info.hash)).rejects.toThrow("does not match the challenge");
    expect(uploaded).not.toHaveBeenCalled();
    expect(sdk.blobs.get(`files/tests/${info.hash}/data`)?.body.toString()).toBe("verified");
    await service._cleanUsage(info.hash, owner.getUUID(), "images", "WebdaTest/Task");
    expect(await service.getUsageCount(info.hash)).toBe(1);
    await service._cleanUsage(info.hash, owner.getUUID(), "", "WebdaTest/Task");
    expect(await service.getUsageCount(info.hash)).toBe(1);
    await service._cleanUsage(info.hash, owner.getUUID(), "other", "WebdaTest/Task");
    expect(await service.headContent(`azure://files/tests/${info.hash}/data`)).toBeUndefined();
    uploaded.mockRestore();
  }

  @test async verifiesServerSideFilesAndHandlesProofConflicts() {
    const service = useDynamicService<AzureBlobBinary>("Blob");
    const owner = new (useModel("WebdaTest/Task"))({ uuid: "store-owner" }) as any;
    const uploaded = vi.spyOn(service, "uploadSuccess").mockResolvedValue(undefined);
    const file = new MemoryBinaryFile("server-side bytes", { name: "file", mimetype: "text/plain" });
    try {
      await service.store(owner, "images", file);
      await service.store(owner, "images", file);
      expect(uploaded).toHaveBeenCalledTimes(2);
      expect((await buffer(await service._get({ hash: file.hash } as any))).toString()).toBe("server-side bytes");
      sdk.blobs.get(`files/tests/${file.hash}/data`)!.metadata.webdaproof = "wrong";
      await expect(service.store(owner, "images", file)).rejects.toThrow("proof does not match");
      const fail = vi.spyOn(service, "putContent").mockRejectedValueOnce(new Error("offline"));
      await expect(service.store(owner, "images", file)).rejects.toThrow("offline");
      fail.mockRestore();
      const info = { ...hashes("server-side bytes"), size: 17, name: "file", mimetype: "text/plain", metadata: {} };
      await expect(service.putRedirectUrl(owner, "images", { ...info, challenge: "invalid" })).rejects.toThrow(
        "challenge is required"
      );
      sdk.blobs.get(`files/tests/${file.hash}/data`)!.metadata.webdaproof = info.challenge;
      service.parameters.maxUploadSize = 1;
      await expect(service.putRedirectUrl(owner, "images", info)).rejects.toThrow("File too big");
      service.parameters.maxUploadSize = undefined;
      const deployer = { resources: { subscriptionId: "s", resourceGroup: "g", location: "westeurope" } } as any;
      expect(service.getAzureResources(deployer).roleAssignments).toHaveLength(2);
      expect(useDynamicService<AzureBlobBinary>("Shared").getAzureResources(deployer)).toEqual({});
    } finally {
      service.parameters.maxUploadSize = undefined;
      uploaded.mockRestore();
    }
  }

  @test async validatesStagedUploadSizeExpiryAndOwnership() {
    const service = useDynamicService<AzureBlobBinary>("Blob");
    const owner = new (useModel("WebdaTest/Task"))({ uuid: "pending-owner" }) as any;
    const info = { ...hashes("pending"), size: 7, name: "file", mimetype: "text/plain", metadata: {} };
    await expect(service.completeUpload(owner, "images", info.hash)).rejects.toThrow("No pending upload");
    const upload = await service.putRedirectUrl(owner, "images", undefined, { getInput: async () => info } as any);
    const staging = new URL(upload!.url).pathname.slice(1);
    sdk.blobs.set(staging, { body: Buffer.from("short"), metadata: {}, etag: "stage" });
    await expect(service.completeUpload(owner, "images", info.hash)).rejects.toThrow("size does not match");
    service.parameters.pendingTimeout = -1;
    await expect(service.completeUpload(owner, "images", info.hash)).rejects.toThrow("Pending upload expired");
    service.parameters.pendingTimeout = 3600;
    sdk.blobs.set(staging, { body: Buffer.from("pending"), metadata: {}, etag: "stage" });
    const canonical = `files/tests/${info.hash}/data`;
    sdk.blobs.set(canonical, { body: Buffer.from("pending"), metadata: { webdaproof: "wrong" }, etag: "canonical" });
    await expect(service.completeUpload(owner, "images", info.hash)).rejects.toThrow("proof does not match");
    const success = vi.spyOn(service, "uploadSuccess").mockResolvedValue(undefined);
    sdk.blobs.get(canonical)!.metadata.webdaproof = info.challenge;
    try {
      await service.completeUpload(owner, "images", info.hash);
      expect(success).toHaveBeenCalled();
    } finally {
      success.mockRestore();
    }
  }

  @test async supportsExplicitEmulatorApiVersions() {
    const service = useDynamicService<AzureBlobBinary>("Shared");
    service.parameters.serviceVersion = "2023-11-03";
    try {
      await service.init();
      const next = { sendRequest: vi.fn(async () => ({})) },
        headers = { set: vi.fn() };
      await sdk.pipelines.at(-1).factories[0].create(next).sendRequest({ headers });
      expect(headers.set).toHaveBeenCalledWith("x-ms-version", "2023-11-03");
      service.parameters.serviceVersion = "invalid";
      await expect(service.init()).rejects.toThrow("Invalid Azure Blob serviceVersion");
    } finally {
      service.parameters.serviceVersion = undefined;
    }
  }

  @test async propagatesStorageFailuresWithoutReportingMissingContent() {
    const service = useDynamicService<AzureBlobBinary>("Blob");
    const failure = new Error("storage unavailable");
    const client = vi.spyOn(service as any, "blob").mockReturnValue({
      uploadStream: vi.fn().mockRejectedValue(failure),
      getProperties: vi.fn().mockRejectedValue(failure),
      download: vi.fn().mockRejectedValue(failure)
    });
    try {
      await expect(service.putContent("azure://files/failure", "content")).rejects.toBe(failure);
      await expect(service.headContent("azure://files/failure")).rejects.toBe(failure);
      await expect(service.getContent("azure://files/failure")).rejects.toBe(failure);
      const owner = new (useModel("WebdaTest/Task"))({ uuid: "failure-owner" }) as any;
      await expect(service.completeUpload(owner, "images", hashes("failure").hash)).rejects.toBe(failure);
    } finally {
      client.mockRestore();
    }
  }
}
