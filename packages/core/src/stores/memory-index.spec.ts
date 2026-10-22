import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TypeIndexedMap } from "@webda/models";
import { MemoryStore, useModel } from "../index.js";
import { WebdaApplicationTest } from "../test/application.js";

/**
 * MemoryStore storage type index (#922): a query only reads the documents of its model, across persistence
 * reloads and raw writes
 */
@suite
class MemoryStoreTypeIndexTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return "../../sample-app/webda.config.jsonc";
  }

  /**
   * @param name - service name
   * @param path - persistence file
   * @returns an initialized store holding Projects (and subclasses) and Companies
   */
  async store(name: string, path: string): Promise<MemoryStore> {
    return this.addService(
      MemoryStore,
      {
        models: ["WebdaDemo/Project", "WebdaDemo/Company"],
        persistence: { path, delay: 0, compressionLevel: 0 }
      } as any,
      name
    );
  }

  /**
   * @param store - the store
   * @returns the repositories of the store
   */
  repositories(store: MemoryStore) {
    return {
      projects: store.getRepository(useModel("WebdaDemo/Project")) as any,
      subProjects: store.getRepository(useModel("WebdaDemo/SubProject")) as any,
      companies: store.getRepository(useModel("WebdaDemo/Company")) as any
    };
  }

  /**
   * Keys read from the storage while running a function
   * @param store - the store
   * @param fn - the function to run
   * @returns the keys read
   */
  async readKeys(store: MemoryStore, fn: () => Promise<any>): Promise<string[]> {
    const read: string[] = [];
    const get = store.storage.get;
    store.storage.get = (key: string) => {
      read.push(key);
      return get.call(store.storage, key);
    };
    try {
      await fn();
    } finally {
      store.storage.get = get;
    }
    return read;
  }

  @test
  async persistenceReloadKeepsTheIndex() {
    const path = join(tmpdir(), `webda-memory-index-${process.pid}-${Date.now()}.ldjson`);
    try {
      const store = await this.store("indexWrite", path);
      assert.ok(store.storage instanceof TypeIndexedMap);
      const { projects, subProjects, companies } = this.repositories(store);
      const Project = useModel("WebdaDemo/Project") as any;
      const SubProject = useModel("WebdaDemo/SubProject") as any;
      for (let i = 0; i < 5; i++) {
        await projects.create(new Project().load({ uuid: `p${i}`, name: `p${i}` }));
        await subProjects.create(new SubProject().load({ uuid: `s${i}`, name: `s${i}` }));
        await companies.create({ uuid: `c${i}`, name: `c${i}` });
      }
      await projects.delete("p0");
      await companies.patch("c1", { name: "patched" });
      await store.stop();

      const reloaded = await this.store("indexRead", path);
      assert.ok(reloaded.storage instanceof TypeIndexedMap);
      assert.strictEqual(reloaded.storage.size, 14);
      const repos = this.repositories(reloaded);
      const uuids = async (repo: any, query = "") => (await repo.query(query)).results.map((r: any) => r.uuid);
      assert.deepStrictEqual(await uuids(repos.projects), ["s0", "p1", "s1", "p2", "s2", "p3", "s3", "p4", "s4"]);
      assert.deepStrictEqual(await uuids(repos.subProjects), ["s0", "s1", "s2", "s3", "s4"]);
      assert.deepStrictEqual(await uuids(repos.companies, "name = 'patched'"), ["c1"]);
      // A company query does not read the projects
      const read = await this.readKeys(reloaded, () => repos.companies.query(""));
      assert.deepStrictEqual(read.sort(), ["c0", "c1", "c2", "c3", "c4"]);
      // A raw patch (migration) moves a plain row to its new type
      reloaded.storage.set("x", JSON.stringify({ uuid: "x", __type: "WebdaDemo/Company", name: "x" }));
      assert.deepStrictEqual(await uuids(repos.companies), ["c0", "c1", "c2", "c3", "c4", "x"]);
      await reloaded.rawPatch("indexRead", "x", { __type: "WebdaDemo/SubProject" });
      assert.deepStrictEqual(await uuids(repos.companies), ["c0", "c1", "c2", "c3", "c4"]);
      assert.deepStrictEqual(await uuids(repos.subProjects), ["s0", "s1", "s2", "s3", "s4", "x"]);
    } finally {
      if (existsSync(path)) unlinkSync(path);
    }
  }
}
