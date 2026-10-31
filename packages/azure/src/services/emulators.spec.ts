import { suite, test } from "@webda/test";
import {
  MemoryBinaryFile,
  SecretString,
  useDynamicService,
  useModel,
  StoreNotFoundError,
  UpdateConditionFailError
} from "@webda/core";
import { checkCreateWithoutPrimaryKey } from "@webda/core/lib/test/index.js";
import { expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { addAzureModda, AzureTest } from "../../test/fixture.js";
import { AzureBlobBinary, AzureBlobBinaryParameters } from "./blob.service.js";
import { CosmosStore, CosmosStoreParameters } from "./cosmos.service.js";

const emulatorSuite = process.env.AZURE_EMULATOR_TESTS === "true" ? suite : suite.skip;
const blobSuite =
  process.env.AZURE_EMULATOR_TESTS === "true" || process.env.AZURE_BLOB_EMULATOR_TESTS === "true" ? suite : suite.skip;
const cosmosKey = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";

@blobSuite
class AzureBlobEmulatorTest extends AzureTest {
  async tweakApp(app) {
    await super.tweakApp(app);
    addAzureModda(app, "Test/Azurite", AzureBlobBinary, AzureBlobBinaryParameters);
    Object.assign(app.getCurrentConfiguration().services, {
      Blob: {
        type: "Test/Azurite",
        connectionString: new SecretString("UseDevelopmentStorage=true", "test"),
        serviceVersion: "2023-11-03",
        container: "webda-tests",
        prefix: randomUUID(),
        createContainer: true,
        models: { "WebdaTest/Task": ["images", "other"] }
      }
    });
  }

  @test async blobUploadAndOwnership() {
    const blob = useDynamicService<AzureBlobBinary>("Blob");
    const owner = new (useModel("WebdaTest/Task"))({ uuid: "owner" }) as any;
    const success = vi.spyOn(blob, "uploadSuccess").mockResolvedValue(undefined);
    const file = new MemoryBinaryFile("emulator bytes", { name: "test.txt", mimetype: "text/plain" });
    const info = { ...file.toBinaryFileInfo(), ...(await file.computeHashes()) };
    const upload = await blob.putRedirectUrl(owner, "images", info);
    expect(upload).toBeDefined();
    const response = await fetch(upload!.url, { method: "PUT", headers: upload!.headers, body: "emulator bytes" });
    expect(response.status).toBe(201);
    await blob.completeUpload(owner, "images", info.hash);
    expect(success).toHaveBeenCalled();
    expect(await blob.getUsageCount(info.hash)).toBe(1);
    expect(await blob.putRedirectUrl(owner, "other", info)).toBeUndefined();
    const url = await blob.getSignedUrlFromMap({ hash: info.hash } as any, 60, {} as any);
    expect(await (await fetch(url)).text()).toBe("emulator bytes");
    await blob._cleanUsage(info.hash, owner.getUUID(), "images", "WebdaTest/Task");
    expect(await blob.getUsageCount(info.hash)).toBe(1);
    await blob._cleanUsage(info.hash, owner.getUUID(), "other", "WebdaTest/Task");
    expect(await blob.getUsageCount(info.hash)).toBe(0);
    success.mockRestore();
  }
}

@emulatorSuite
class AzureCosmosEmulatorTest extends AzureTest {
  async tweakApp(app) {
    await super.tweakApp(app);
    addAzureModda(app, "Test/Cosmos", CosmosStore, CosmosStoreParameters);
    app.getCurrentConfiguration().services.Cosmos = {
      type: "Test/Cosmos",
      endpoint: "https://localhost:8081",
      key: new SecretString(cosmosKey, "test"),
      database: "webda-test",
      container: randomUUID(),
      createIfNotExists: true,
      models: ["WebdaTest/Task"]
    };
  }

  @test async cosmosStoreConformance() {
    const store = useDynamicService<CosmosStore>("Cosmos");
    const repository = store.getRepository(useModel("WebdaTest/Task"));
    const raw = (repository as any).repository;
    await checkCreateWithoutPrimaryKey([repository, raw], {
      data: index => ({ name: `generated-${index}` }),
      readStored: async key => {
        try {
          return (await raw.read(key)).value;
        } catch (error) {
          if (error instanceof StoreNotFoundError) return undefined;
          throw error;
        }
      }
    });
    await repository.create({ uuid: "item", count: 1, name: "original" } as any);
    await repository.patch("item", { name: "updated" }, "count", 1);
    await expect(repository.patch("item", { name: "wrong" }, "count", 8)).rejects.toBeInstanceOf(
      UpdateConditionFailError
    );
    await repository.incrementAttributes("item", { count: 2 });
    expect((await repository.get("item")).count).toBe(3);
    await repository.removeAttribute("item", "name");
    expect((await repository.get("item")).name).toBeUndefined();
    const first = await repository.query("count >= 0 LIMIT 1");
    expect(first.results).toHaveLength(1);
    await repository.delete("item", "count", 3);
    expect(await repository.exists("item")).toBe(false);
    await expect(repository.get("missing")).rejects.toBeInstanceOf(StoreNotFoundError);
    await store["client"].database(store.parameters.database).container(store.parameters.container).delete();
  }
}
