import { suite, test } from "@webda/test";
import * as assert from "assert";
import { UuidModel } from "../model.model.js";
import { MemoryRepository, TypeIndexedMap } from "./memory";

/**
 * Type index of the MemoryRepository storage (#922)
 *
 * Every model of a MemoryStore shares one storage map: a query must only read the entries of its model (and
 * subclasses), never parse the documents of the other models.
 */
class Post extends UuidModel {
  title: string;
  views: number;
  tags: string[];
  constructor(data?: Partial<Post>) {
    super(data);
    this.title = data?.title ?? "";
    this.views = data?.views ?? 0;
    this.tags = data?.tags ?? [];
  }
}
Post.registerSerializer();

class BlogPost extends Post {}
BlogPost.registerSerializer();

class DraftBlogPost extends BlogPost {}
DraftBlogPost.registerSerializer();

class Comment extends UuidModel {
  text: string;
  constructor(data?: Partial<Comment>) {
    super(data);
    this.text = data?.text ?? "";
  }
}
Comment.registerSerializer();

(DraftBlogPost as any).Metadata = { Identifier: "Index/DraftBlogPost", Subclasses: [] };
(BlogPost as any).Metadata = { Identifier: "Index/BlogPost", Subclasses: [DraftBlogPost] };
(Post as any).Metadata = { Identifier: "Index/Post", Subclasses: [BlogPost] };
(Comment as any).Metadata = { Identifier: "Index/Comment", Subclasses: [] };

/**
 * Count the JSON.parse calls made while running a function
 * @param fn - the function to run
 * @returns the number of JSON.parse calls
 */
async function countParses(fn: () => any): Promise<number> {
  const original = JSON.parse;
  let count = 0;
  JSON.parse = function countingParse(...args: any[]) {
    count++;
    return (original as any).apply(JSON, args);
  } as any;
  try {
    await fn();
  } finally {
    JSON.parse = original;
  }
  return count;
}

/**
 * @param type - the stored type, undefined for none
 * @param uuid - the uuid
 * @returns a serialized envelope
 */
function envelope(type: string | undefined, uuid: string): string {
  return JSON.stringify({ value: { uuid }, $serializer: { type: "x" }, ...(type ? { __type: type } : {}) });
}

@suite
class TypeIndexedMapTest {
  @test
  keysInInsertionOrder() {
    const map = new TypeIndexedMap();
    map.set("a", envelope("A", "a"));
    map.set("b", envelope("B", "b"));
    map.set("c", envelope("A", "c"));
    map.set("d", envelope(undefined, "d"));
    map.set("e", "{not json");
    (map as Map<string, any>).set("f", { uuid: "f", __type: "B" });
    map.set("g", envelope("B", "g"));
    const seen: (string | undefined)[] = [];
    const accept = (type?: string) => {
      seen.push(type);
      return type === "A";
    };
    // Unreadable entries (corrupted string, non-string value) are always kept so their error surfaces
    assert.deepStrictEqual(map.keysOfTypes(accept), ["a", "c", "e", "f"]);
    // The predicate is evaluated per distinct type, not per entry
    assert.deepStrictEqual(seen.sort(), ["A", "B", undefined].sort());
    assert.deepStrictEqual(
      map.keysOfTypes(type => type === undefined || type === "B"),
      ["b", "d", "e", "f", "g"]
    );
    assert.deepStrictEqual(
      map.keysOfTypes(() => true),
      [...map.keys()]
    );
    assert.deepStrictEqual(
      map.keysOfTypes(() => false),
      ["e", "f"]
    );
  }

  @test
  async parsesEachWriteOnce() {
    const map = new TypeIndexedMap();
    // Writes do not parse
    assert.strictEqual(
      await countParses(() => {
        for (let i = 0; i < 10; i++) map.set(`k${i}`, envelope(i % 2 ? "A" : "B", `k${i}`));
      }),
      0
    );
    // The first read indexes the pending writes, once
    assert.strictEqual(await countParses(() => map.keysOfTypes(t => t === "A")), 10);
    assert.strictEqual(await countParses(() => map.keysOfTypes(t => t === "B")), 0);
    map.set("k1", envelope("A", "k1"));
    assert.strictEqual(await countParses(() => map.keysOfTypes(t => t === "A")), 1);
  }

  @test
  typeChangeKeepsMapPosition() {
    const map = new TypeIndexedMap();
    map.set("a", envelope("A", "a"));
    map.set("b", envelope("A", "b"));
    map.set("c", envelope("A", "c"));
    map.keysOfTypes(() => true);
    // Retyped: leaves A, joins B at its map position
    map.set("a", envelope("B", "a"));
    map.set("z", envelope("B", "z"));
    assert.deepStrictEqual(
      map.keysOfTypes(t => t === "A"),
      ["b", "c"]
    );
    assert.deepStrictEqual(
      map.keysOfTypes(t => t === "B"),
      ["a", "z"]
    );
    assert.deepStrictEqual(
      map.keysOfTypes(() => true),
      ["a", "b", "c", "z"]
    );
    // Retyped back while pending: position unchanged too
    map.set("a", envelope("A", "a"));
    assert.deepStrictEqual(
      map.keysOfTypes(t => t === "A"),
      ["a", "b", "c"]
    );
  }

  @test
  deleteAndClear() {
    const map = new TypeIndexedMap();
    map.set("a", envelope("A", "a"));
    map.set("b", envelope("A", "b"));
    map.keysOfTypes(() => true);
    assert.strictEqual(map.delete("a"), true);
    assert.strictEqual(map.delete("missing"), false);
    assert.deepStrictEqual(
      map.keysOfTypes(t => t === "A"),
      ["b"]
    );
    // Re-inserted after a delete: last, like the Map
    map.set("a", envelope("A", "a"));
    assert.deepStrictEqual(
      map.keysOfTypes(t => t === "A"),
      ["b", "a"]
    );
    // Deleted while pending
    map.set("c", envelope("A", "c"));
    map.delete("c");
    assert.deepStrictEqual(
      map.keysOfTypes(t => t === "A"),
      ["b", "a"]
    );
    map.clear();
    assert.strictEqual(map.size, 0);
    assert.deepStrictEqual(
      map.keysOfTypes(() => true),
      []
    );
    map.set("d", envelope("A", "d"));
    assert.deepStrictEqual(
      map.keysOfTypes(() => true),
      ["d"]
    );
  }

  @test
  constructorEntries() {
    const map = new TypeIndexedMap([
      ["a", envelope("A", "a")],
      ["b", envelope("B", "b")]
    ]);
    assert.strictEqual(map.get("a"), envelope("A", "a"));
    assert.deepStrictEqual(
      map.keysOfTypes(t => t === "B"),
      ["b"]
    );
  }
}

/**
 * Operations run against a storage, the same on a plain Map and on a TypeIndexedMap
 * @param storage - the shared storage
 * @returns the repositories
 */
async function scenario(storage: Map<string, string>) {
  const posts = new MemoryRepository(Post, ["uuid"], "_", storage);
  const blogs = new MemoryRepository(BlogPost, ["uuid"], "_", storage);
  const drafts = new MemoryRepository(DraftBlogPost, ["uuid"], "_", storage);
  const comments = new MemoryRepository(Comment, ["uuid"], "_", storage);
  for (let i = 0; i < 12; i++) {
    const clazz = [Post, BlogPost, DraftBlogPost][i % 3];
    const repo = [posts, blogs, drafts][i % 3] as MemoryRepository<any>;
    await repo.create(new clazz({ uuid: `p${i}`, title: `t${i}`, views: i } as any));
    await comments.create(new Comment({ uuid: `c${i}`, text: `c${i}` } as any));
  }
  // update: a post rewritten as a BlogPost instance changes type in place
  await posts.update(new BlogPost({ uuid: "p0", title: "retyped", views: 100 } as any));
  // update with plain data keeps the stored class
  await posts.update({ uuid: "p1", title: "plain", views: 1 } as any);
  await blogs.patch("p4", { title: "patched" } as any);
  await posts.incrementAttributes("p3", { views: 5 } as any);
  await posts.upsertItemToCollection("p3" as any, "tags" as any, "x" as any);
  await posts.removeAttribute("p6" as any, "title" as any);
  await posts.delete("p2" as any);
  await comments.delete("c2" as any);
  // re-created after a delete: last in the storage order
  await posts.create(new Post({ uuid: "p2", title: "again" } as any));
  await posts.updateMany("UPDATE SET title = 'bulk' WHERE views > 9");
  await comments.deleteMany("DELETE WHERE text = 'c5'");
  await posts.deleteMany("DELETE WHERE views = 7");
  return { posts, blogs, drafts, comments };
}

/**
 * Snapshot of every query of the scenario
 * @param repos - the repositories
 * @returns the uuids returned by each query
 */
async function snapshot(repos: Awaited<ReturnType<typeof scenario>>) {
  const out: Record<string, any> = {};
  for (const [name, repo] of Object.entries(repos)) {
    out[name] = (await (repo as MemoryRepository<any>).query("")).results.map((r: any) => [
      r.uuid,
      r.constructor.name,
      r.title ?? r.text,
      r.views
    ]);
    // Offset pagination goes through the same key list
    const pages: string[][] = [];
    let token: string | undefined;
    do {
      const res = await (repo as MemoryRepository<any>).query(`LIMIT 4${token ? ` OFFSET '${token}'` : ""}`);
      pages.push(res.results.map((r: any) => r.uuid));
      token = res.continuationToken;
    } while (token);
    out[`${name}.pages`] = pages;
    out[`${name}.ordered`] = (await (repo as MemoryRepository<any>).query("ORDER BY uuid DESC LIMIT 5")).results.map(
      (r: any) => r.uuid
    );
  }
  out["posts.filtered"] = (await repos.posts.query("views >= 4 AND title != 'bulk'")).results.map((r: any) => r.uuid);
  return out;
}

@suite
class MemoryRepositoryTypeIndexTest {
  @test
  defaultStorageIsIndexed() {
    const repo = new MemoryRepository(Post, ["uuid"]);
    assert.ok((repo as any).storage instanceof TypeIndexedMap);
  }

  @test
  async sameResultsAsAPlainMap() {
    const expected = await snapshot(await scenario(new Map()));
    const indexed = new TypeIndexedMap();
    const actual = await snapshot(await scenario(indexed));
    assert.deepStrictEqual(actual, expected);
    // Sanity on the scenario itself
    assert.deepStrictEqual(
      expected.drafts.map((r: any) => r[0]),
      ["p5", "p8", "p11"]
    );
    assert.ok(expected.blogs.some((r: any) => r[0] === "p0" && r[1] === "BlogPost"));
    assert.ok(!expected.comments.some((r: any) => r[0] === "c2" || r[0] === "c5"));
  }

  @test
  async queriesOnlyReadTheirModel() {
    const storage = new TypeIndexedMap();
    const { posts, comments, drafts } = await scenario(storage);
    // Warm the index: the writes of the scenario are parsed once
    await posts.query("");
    const read: string[] = [];
    const get = storage.get.bind(storage);
    storage.get = (key: string) => {
      read.push(key);
      return get(key);
    };
    await comments.query("text = 'c1'");
    assert.ok(read.length > 0);
    assert.ok(
      read.every(key => key.startsWith("c")),
      `comment query read ${read.join(",")}`
    );
    read.length = 0;
    await drafts.query("");
    assert.deepStrictEqual(read.sort(), ["p11", "p5", "p8"]);
    read.length = 0;
    await posts.deleteMany("DELETE WHERE views = 1000");
    assert.ok(read.every(key => key.startsWith("p")));
    // Once indexed, only the documents of the model are parsed (envelope + serializer, by get): never the posts
    const commentCount = [...storage.keys()].filter(key => key.startsWith("c")).length;
    const parses = await countParses(() => comments.query("text = 'c1'"));
    assert.ok(parses <= 2 * commentCount, `${parses} parses for ${commentCount} comments`);
  }

  @test
  async writesThroughTheMapAreIndexed() {
    // Persistence reload, migrations and raw patches write to the storage directly
    const storage = new TypeIndexedMap();
    const posts = new MemoryRepository(Post, ["uuid"], "_", storage);
    const comments = new MemoryRepository(Comment, ["uuid"], "_", storage);
    await posts.create(new Post({ uuid: "p1" } as any));
    assert.strictEqual((await comments.query("")).results.length, 0);
    storage.set("c1", JSON.stringify({ uuid: "c1", __type: "Index/Comment", text: "raw" }));
    assert.deepStrictEqual(
      (await comments.query("")).results.map((r: any) => r.uuid),
      ["c1"]
    );
    // Retyped by a raw write
    storage.set("c1", JSON.stringify({ uuid: "c1", __type: "Index/Post", title: "moved" }));
    assert.strictEqual((await comments.query("")).results.length, 0);
    assert.deepStrictEqual(
      (await posts.query("")).results.map((r: any) => r.uuid),
      ["p1", "c1"]
    );
    // Corrupted rows still surface on every model
    storage.set("broken", "{not json");
    await assert.rejects(() => comments.query(""));
    await assert.rejects(() => posts.query(""));
    storage.delete("broken");
    assert.strictEqual((await posts.query("")).results.length, 2);
  }
}
