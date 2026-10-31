import { suite, test } from "@webda/test";
import { SecretString, useDynamicService, useModel, UpdateConditionFailError, StoreNotFoundError } from "@webda/core";
import { checkCreateWithoutPrimaryKey } from "@webda/core/lib/test/index.js";
import * as QL from "@webda/ql";
import { expect, vi } from "vitest";
import { addAzureModda, AzureTest } from "../../test/fixture.js";
import { CosmosRepository, CosmosStore, CosmosStoreParameters, cosmosQuery } from "./cosmos.service.js";

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
    expect((resources.resources![2].properties as any).scope).toMatch(/\/dbs\/webda\/colls\/items$/);
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

  @test async rejectsUnsafeMutationsAndPreservesAtomicConditions() {
    const store = useDynamicService<CosmosStore>("Cosmos"),
      Model = useModel("WebdaTest/Task");
    const repository = store.getRepository(Model),
      raw = (repository as any).repository as CosmosRepository<any>;
    const at = new Date("2026-01-01");
    await repository.create({ uuid: "advanced", count: 1, at } as any);
    sdk.patches.mockClear();
    await raw.patch("advanced", { count: 1 });
    expect(sdk.patches).not.toHaveBeenCalled();
    await raw.patch("advanced", { reviewedAt: at });
    expect((await raw.get("advanced")).reviewedAt).toEqual(at);
    expect(sdk.patches.mock.calls.at(-1)![0]).toContainEqual({
      op: "set",
      path: "/$serializer",
      value: expect.any(Object)
    });
    await repository.patch("advanced", { count: 2 }, "at", at);
    await expect(raw.patch("advanced", { uuid: "changed" })).rejects.toThrow("Cannot change a Cosmos primary key");
    expect((await repository.get("advanced")).uuid).toBe("advanced");
    await repository.incrementAttributes("advanced", ["count", { property: "other", value: 3 }] as any);
    expect((await repository.get("advanced")).other).toBe(3);
    await expect(repository.incrementAttributes("advanced", { "__proto__.polluted": 1 } as any)).rejects.toThrow(
      "Invalid Cosmos increment"
    );
    sdk.failWrite = true;
    await expect(repository.update({ uuid: "advanced", count: 4 } as any)).rejects.toBeInstanceOf(
      UpdateConditionFailError
    );
    sdk.failWrite = true;
    await expect(repository.delete("advanced")).rejects.toBeInstanceOf(UpdateConditionFailError);
    await expect(raw.deleteMany()).rejects.toThrow("bulk delete");
    await expect(raw.updateMany()).rejects.toThrow("bulk update");
    const results: any[] = [];
    for await (const item of raw.iterate("LIMIT 100")) results.push(item);
    expect(results.some(item => item.uuid === "advanced")).toBe(true);
    const item = vi.spyOn(raw as any, "item");
    item.mockReturnValueOnce({ read: async () => ({ resource: undefined }) });
    await expect(raw.get("missing-resource")).rejects.toBeInstanceOf(StoreNotFoundError);
    item.mockReturnValueOnce({
      read: async () => {
        throw new Error("network failure");
      }
    });
    await expect(raw.exists("advanced")).rejects.toThrow("network failure");
    item.mockRestore();
    await store.stop();
    store.parameters.key = new SecretString("emulator-key", "test");
    store.parameters.createIfNotExists = false;
    await store.init();
  }

  @test async supportsPrimaryKeyPartitionsAndRejectsUnsupportedQueries() {
    const store = useDynamicService<CosmosStore>("Cosmos"),
      Model = useModel("WebdaTest/Task");
    const getContainer = () =>
      store["client"].database(store.parameters.database).container(store.parameters.container);
    const repository = new CosmosRepository(Model, ["uuid"], getContainer, "/uuid");
    await repository.create({ uuid: "partitioned", count: 1 } as any);
    expect((await repository.get("partitioned")).uuid).toBe("partitioned");
    expect(sdk.documents.get(Buffer.from("partitioned").toString("base64url")).uuid).toBe("partitioned");
    await expect(repository.get({ uuid: {} })).rejects.toThrow("scalar value");
    expect(() => new CosmosRepository(Model, ["uuid"], getContainer, "/other")).toThrow("primary key field");
    expect(() => cosmosQuery({ filter: { eval: () => true } } as any)).toThrow("Unsupported Cosmos query expression");
    expect(() => cosmosQuery({ filter: new QL.ComparisonExpression("GLOB" as any, "name", "a") } as any)).toThrow(
      "Unsupported Cosmos query operator"
    );
  }

  @test async rejectsCorruptDocumentIdentitiesAndSupportsEtagConditions() {
    const store = useDynamicService<CosmosStore>("Cosmos");
    const repository = store.getRepository(useModel("WebdaTest/Task"));
    const raw = (repository as any).repository as CosmosRepository<any>;
    const model = await repository.create({ uuid: "etag", count: 1 } as any);
    const document = sdk.documents.get(Buffer.from("etag").toString("base64url"));
    await raw.update(model, "_etag", document._etag);
    await raw.incrementAttributes("etag", [{ property: "count" }] as any);
    expect((await raw.get("etag")).count).toBe(2);
    const stored = sdk.documents.get(Buffer.from("etag").toString("base64url"));
    const id = stored.id;
    stored.id = "corrupt";
    try {
      await expect(raw.patch("etag", { count: 3 })).rejects.toThrow("Cannot change a Cosmos primary key");
      await expect(raw.update({ uuid: "etag", count: 4 })).rejects.toThrow("Cannot change a Cosmos primary key");
    } finally {
      stored.id = id;
    }
    const types = vi.spyOn(raw, "acceptedTypes").mockReturnValueOnce([]);
    await raw.query(QL.parse("count > 0"));
    expect(sdk.query.mock.calls.at(-1)![0].query).not.toContain("__type");
    await raw.query("count > 0");
    await raw.query("count > :count", { count: 0 });
    types.mockRestore();
    const items = [];
    for await (const item of raw.iterate("count >= :count", { count: 0 })) items.push(item);
    expect(items.length).toBeGreaterThan(0);
    store.parameters.throughput = 400;
    try {
      expect(
        store.getAzureResources({
          resources: { subscriptionId: "s", resourceGroup: "g", location: "westeurope" },
          getAppPrincipalId: () => "[reference('app').identity.principalId]"
        } as any).resources![1].properties.options
      ).toEqual({ throughput: 400 });
    } finally {
      store.parameters.throughput = undefined;
    }
  }

  @test emptyBooleanQueriesPreserveTheirMeaning() {
    for (const [filter, expected] of [
      [new QL.BooleanExpression(true), "true"],
      [new QL.BooleanExpression(false), "false"],
      [new QL.AndExpression([]), "true"],
      [new QL.OrExpression([]), "false"]
    ] as const) {
      expect(cosmosQuery({ filter } as any).query).toBe(`SELECT * FROM c WHERE ${expected}`);
    }
  }
}
