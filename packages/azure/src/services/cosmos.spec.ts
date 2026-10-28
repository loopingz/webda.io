import { suite, test } from "@webda/test";
import { useDynamicService, useModel, UpdateConditionFailError, StoreNotFoundError } from "@webda/core";
import { checkCreateWithoutPrimaryKey } from "@webda/core/lib/test/index.js";
import * as QL from "@webda/ql";
import { expect, vi } from "vitest";
import { addAzureModda, AzureTest } from "../../test/fixture.js";
import { CosmosStore, CosmosStoreParameters, cosmosQuery } from "./cosmos.service.js";

const sdk = vi.hoisted(() => ({
  documents: new Map<string, any>(),
  version: 0,
  failWrite: false,
  patches: vi.fn(),
  query: vi.fn(),
  create: vi.fn(async () => ({})),
  dispose: vi.fn()
}));
vi.mock("@azure/cosmos", () => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const put = (id, value) => {
    const resource = { ...clone(value), _etag: String(++sdk.version) };
    sdk.documents.set(id, resource);
    return { resource };
  };
  const check = (id, options) => {
    const doc = sdk.documents.get(id);
    if (!doc) throw { code: 404 };
    if (sdk.failWrite || options.accessCondition.condition !== doc._etag) {
      sdk.failWrite = false;
      throw { code: 412 };
    }
    return clone(doc);
  };
  const container = {
    id: "items",
    item(id, _partition) {
      return {
        async read() {
          if (!sdk.documents.has(id)) throw { code: 404 };
          return { resource: clone(sdk.documents.get(id)) };
        },
        async replace(value, options) {
          check(id, options);
          return put(id, value);
        },
        async delete(options) {
          check(id, options);
          sdk.documents.delete(id);
        },
        async patch(operations, options) {
          const doc = check(id, options);
          sdk.patches(operations, options);
          for (const operation of operations) {
            const segments = operation.path
              .slice(1)
              .split("/")
              .map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"));
            const key = segments.pop()!;
            const holder = segments.reduce((value, part) => value[part], doc);
            if (operation.op === "remove") delete holder[key];
            else if (operation.op === "incr") holder[key] = (holder[key] ?? 0) + operation.value;
            else holder[key] = operation.value;
          }
          return put(id, doc);
        }
      };
    },
    items: {
      async create(doc) {
        if (sdk.documents.has(doc.id)) throw { code: 409 };
        return put(doc.id, doc);
      },
      query(query, options) {
        sdk.query(query, options);
        return {
          async fetchNext() {
            return {
              resources: [...sdk.documents.values()].slice(0, options.maxItemCount),
              continuationToken: undefined
            };
          }
        };
      }
    }
  };
  return {
    CosmosClient: class {
      databases = { createIfNotExists: sdk.create };
      dispose = sdk.dispose;
      database() {
        return { containers: { createIfNotExists: sdk.create }, container: () => container };
      }
    }
  };
});

@suite
class CosmosTest extends AzureTest {
  async tweakApp(app) {
    await super.tweakApp(app);
    addAzureModda(app, "Test/Cosmos", CosmosStore, CosmosStoreParameters);
    app.getCurrentConfiguration().services.Cosmos = {
      type: "Test/Cosmos",
      endpoint: "https://test.documents.azure.com",
      database: "webda",
      container: "items",
      createIfNotExists: true,
      models: ["WebdaTest/Task"]
    };
  }

  @test async generatedKeysAndCrud() {
    const store = useDynamicService<CosmosStore>("Cosmos");
    const repo = store.getRepository(useModel("WebdaTest/Task"));
    await checkCreateWithoutPrimaryKey([repo], {
      data: index => ({ name: `item-${index}` }),
      readStored: async key => sdk.documents.get(Buffer.from(key).toString("base64url"))?.value
    });
    const item: any = await repo.create({
      uuid: "crud",
      name: "initial",
      count: 1,
      collection: [{ value: "a" }],
      at: new Date("2026-01-01")
    } as any);
    expect((await repo.get("crud")).at).toBeInstanceOf(Date);
    expect(await repo.exists("missing")).toBe(false);
    expect(await repo.exists("crud")).toBe(true);
    await expect(repo.get("missing")).rejects.toBeInstanceOf(StoreNotFoundError);
    await expect(repo.create(item)).rejects.toThrow("already exists");
    await repo.patch("crud", { name: "patched" }, "count", 1);
    expect((await repo.get("crud")).name).toBe("patched");
    await expect(repo.patch("crud", { name: "bad" }, "count", 9)).rejects.toBeInstanceOf(UpdateConditionFailError);
    sdk.failWrite = true;
    await expect(repo.patch("crud", { name: "conflict" })).rejects.toBeInstanceOf(UpdateConditionFailError);
    await repo.incrementAttributes("crud", { count: 2 });
    expect((await repo.get("crud")).count).toBe(3);
    expect(sdk.patches.mock.calls.at(-1)![0]).toContainEqual({ op: "incr", path: "/value/count", value: 2 });
    await repo.removeAttribute("crud", "name");
    expect((await repo.get("crud")).name).toBeUndefined();
    await repo.upsertItemToCollection("crud", "collection", { value: "b" });
    await repo.deleteItemFromCollection("crud", "collection", 0);
    expect((await repo.get("crud")).collection).toEqual([{ value: "b" }]);
    await repo.update({ uuid: "crud", name: "replacement", count: 4 } as any, "count", 3);
    expect((await repo.get("crud")).name).toBe("replacement");
    await expect(
      repo.patch("crud", Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`field${index}`, index])))
    ).rejects.toThrow("ten atomic");
    expect((await repo.get("crud")).field0).toBeUndefined();
    await expect(repo.delete("crud", "count", 8)).rejects.toBeInstanceOf(UpdateConditionFailError);
    await repo.delete("crud", "count", 4);
    expect(await repo.exists("crud")).toBe(false);
    await repo.create({ uuid: "unsaved" } as any, false);
    expect(await repo.exists("unsaved")).toBe(false);
    await repo.query("name = :name LIMIT 2", { name: "item-0" });
    expect(sdk.query.mock.calls.at(-1)![0].parameters).toContainEqual({ name: expect.any(String), value: "item-0" });
    const resources = store.getAzureResources({
      resources: { subscriptionId: "s", resourceGroup: "g", location: "westeurope" },
      getAppPrincipalId: () => "[reference('app').identity.principalId]"
    } as any);
    expect(resources.resources).toHaveLength(3);
    expect(resources.resources![2].type).toBe("Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments");
  }

  @test queryTranslation() {
    for (const query of [
      "name = 'a' AND count >= 1",
      "name IN ['a', 'b'] OR count < 5",
      "tags CONTAINS 'a'",
      "name LIKE 'a%'",
      "name IS NULL",
      "name IS NOT NULL",
      "ORDER BY name DESC LIMIT 2"
    ]) {
      const sql = cosmosQuery(QL.parse(query));
      expect(sql.query).toContain("SELECT * FROM c WHERE");
      expect(sql.query).not.toContain("'a'");
    }
    expect(cosmosQuery(QL.parse("name = 'a' ORDER BY name DESC")).query).toContain('ORDER BY c["value"]["name"] DESC');
  }
}
