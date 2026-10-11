import { suite, test } from "@webda/test";
import * as assert from "assert";
import { escape } from "@webda/ql";
import { UuidModel } from "../model.model.js";
import { MemoryRepository } from "./memory";

/** Model holding a file name and a collection of attached files */
class Document extends UuidModel {
  declare name: string;
  files: { name: string; hash: string }[] = [];
}
Document.registerSerializer();
(Document as any).Metadata = { Identifier: "Test/Document", Subclasses: [] };

/**
 * #670: an apostrophe in a value (e.g. a file named l'été.png) must not break storage nor a WebdaQL query
 */
@suite
class MemoryQuotesTest {
  name = "l'été d'Ève.png";
  injection = "x' OR 1=1 --";

  /**
   * @returns a repository with a document named with apostrophes and another one
   */
  async fill(): Promise<MemoryRepository<typeof Document>> {
    const repo = new MemoryRepository(Document, ["uuid"], ":", new Map());
    await repo.create({ uuid: "a", name: this.name, files: [] } as any);
    await repo.create({ uuid: "b", name: "other", files: [] } as any);
    return repo;
  }

  /**
   * @param repo - the repository
   * @param query - the WebdaQL query
   * @returns the sorted uuids matching
   */
  async uuids(repo: MemoryRepository<typeof Document>, query: string): Promise<string[]> {
    return (await repo.query(query)).results.map((d: any) => d.uuid).sort();
  }

  @test
  async storesAndQueriesApostrophes() {
    const repo = await this.fill();
    assert.strictEqual(((await repo.get("a")) as any).name, this.name);
    // Escaped by the WebdaQL template helper
    assert.deepStrictEqual(await this.uuids(repo, escape(["name = ", ""], [this.name])), ["a"]);
    assert.deepStrictEqual(await this.uuids(repo, escape(["name IN ", ""], [[this.name, "other"]])), ["a", "b"]);
    // Doubled or backslash-escaped by hand
    assert.deepStrictEqual(await this.uuids(repo, "name = 'l''été d''Ève.png'"), ["a"]);
    assert.deepStrictEqual(await this.uuids(repo, "name = 'l\\'été d\\'Ève.png'"), ["a"]);
    assert.deepStrictEqual(await this.uuids(repo, "name LIKE 'l''%'"), ["a"]);
    assert.deepStrictEqual(await this.uuids(repo, `name = "${this.name}"`), ["a"]);
    // An injection attempt is a plain value matching nothing
    assert.deepStrictEqual(await this.uuids(repo, escape(["name = ", ""], [this.injection])), []);
    assert.deepStrictEqual(await this.uuids(repo, escape(["name != ", ""], [this.injection])), ["a", "b"]);
  }

  @test
  async collectionItemsWithApostrophes() {
    const repo = await this.fill();
    await repo.upsertItemToCollection("a", "files" as any, { name: this.name, hash: this.injection } as any);
    await repo.upsertItemToCollection("a", "files" as any, { name: "o'brien.txt", hash: "h2" } as any);
    // Replace with a write condition holding an apostrophe
    await repo.upsertItemToCollection(
      "a",
      "files" as any,
      { name: "it's.txt", hash: "h3" } as any,
      1,
      "name" as any,
      "o'brien.txt"
    );
    await assert.rejects(() =>
      repo.upsertItemToCollection("a", "files" as any, { name: "x", hash: "x" } as any, 0, "name" as any, "l'ete.png")
    );
    const doc: any = await repo.get("a");
    assert.deepStrictEqual(doc.files, [
      { name: this.name, hash: this.injection },
      { name: "it's.txt", hash: "h3" }
    ]);
    assert.deepStrictEqual(((await repo.get("b")) as any).files, []);
    await repo.deleteItemFromCollection("a", "files" as any, 0, "name" as any, this.name);
    assert.deepStrictEqual(((await repo.get("a")) as any).files, [{ name: "it's.txt", hash: "h3" }]);
  }
}
