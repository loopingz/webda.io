import { suite, test } from "@webda/test";
import * as assert from "assert";
import { UuidModel } from "../model";
import { MemoryRepository } from "./memory";
import { registerRepository, Repositories, useRepository } from "./hooks";

/**
 * Class-filter unit tests for `MemoryRepository.query()`.
 *
 * Scenario: a model `Post` and its descendant `BlogPost` share the same
 * underlying storage Map. This mirrors the production wiring used by
 * `MemoryStore.getRepository(model)` — each registered model owns its own
 * `MemoryRepository` instance, but every instance points at the same Map so
 * the data lives in one place.
 *
 * Without class filtering, `Post.query()` would return BlogPost records and
 * `BlogPost.query()` would return Post records, because both repos see every
 * key in the shared Map. The expected behavior is:
 *
 *   - `Post.query("")`     → Post AND BlogPost records (Post + descendants)
 *   - `BlogPost.query("")` → BlogPost records only      (no ancestors)
 *
 * Implementation: `MemoryRepository.serialize` stamps `__type` on the storage
 * envelope, `deserialize` re-surfaces it on the in-memory instance as a
 * non-enumerable property, and `query()` prepends an `__type IN [...]`
 * WebdaQL clause built from `Metadata.Identifier` plus every transitive
 * descendant in `Metadata.Subclasses`. There is no post-filter step.
 *
 * The fixtures stamp a minimal `Metadata` blob (Identifier + Subclasses) on
 * each constructor by hand so they don't need to be loaded through
 * `Application.setModelMetadata`. Tests that want to exercise the no-Metadata
 * fallback declare their own bare classes inline.
 */
class Post extends UuidModel {
  title: string;

  constructor(data?: Partial<Post>) {
    super(data);
    this.title = data?.title ?? "";
  }
}
Post.registerSerializer();

class BlogPost extends Post {
  body: string;

  constructor(data?: Partial<BlogPost>) {
    super(data);
    this.body = data?.body ?? "";
  }
}
BlogPost.registerSerializer();

class NewsPost extends Post {
  source: string;

  constructor(data?: Partial<NewsPost>) {
    super(data);
    this.source = data?.source ?? "";
  }
}
NewsPost.registerSerializer();

// Multi-level: BlogPost → DraftBlogPost. Used to verify that transitive
// descendants are pulled in via `Metadata.Subclasses` walking.
class DraftBlogPost extends BlogPost {
  draft: boolean;

  constructor(data?: Partial<DraftBlogPost>) {
    super(data);
    this.draft = data?.draft ?? true;
  }
}
DraftBlogPost.registerSerializer();

// Stamp the bits of Metadata the class-filter logic actually reads so we
// don't have to wire these through Application. Subclasses lists every
// transitive descendant — that's what `Application.setModelMetadata` does in
// production after walking the full hierarchy.
(Post as any).Metadata = {
  Identifier: "Test/Post",
  Subclasses: [BlogPost, NewsPost, DraftBlogPost]
};
(BlogPost as any).Metadata = {
  Identifier: "Test/BlogPost",
  Subclasses: [DraftBlogPost]
};
(NewsPost as any).Metadata = {
  Identifier: "Test/NewsPost",
  Subclasses: []
};
(DraftBlogPost as any).Metadata = {
  Identifier: "Test/DraftBlogPost",
  Subclasses: []
};

@suite
class MemoryRepositoryClassFilterTest {
  /**
   * Build the production-like wiring: one shared storage Map, one repository
   * per model class, each repo bound to its own model. `MemoryStore` does this
   * the same way.
   *
   * @returns the shared Map and the per-class repos so individual tests can
   *   poke at them directly when needed.
   */
  private setupSharedRepos() {
    const shared = new Map<string, string>();
    const postRepo = new MemoryRepository(Post, ["uuid"], "_", shared);
    const blogRepo = new MemoryRepository(BlogPost, ["uuid"], "_", shared);
    const newsRepo = new MemoryRepository(NewsPost, ["uuid"], "_", shared);
    const draftRepo = new MemoryRepository(DraftBlogPost, ["uuid"], "_", shared);
    registerRepository(Post, postRepo);
    registerRepository(BlogPost, blogRepo);
    registerRepository(NewsPost, newsRepo);
    registerRepository(DraftBlogPost, draftRepo);
    return { shared, postRepo, blogRepo, newsRepo, draftRepo };
  }

  /** Drop our wiring after each test so no test leaks repos to the next. */
  async afterEach() {
    Repositories.delete(Post);
    Repositories.delete(BlogPost);
    Repositories.delete(NewsPost);
    Repositories.delete(DraftBlogPost);
  }

  /**
   * Top of the hierarchy: `Post.query()` must return Post records AND every
   * descendant. The filter uses the JS prototype chain via `instanceof`, so
   * any class that extends Post (transitively) is included automatically.
   */
  @test
  async parentQueryReturnsParentAndDescendants() {
    const { shared } = this.setupSharedRepos();

    await Post.create({ uuid: "p-1", title: "Pure Post" } as any);
    await BlogPost.create({ uuid: "bp-1", title: "Blog Post", body: "body-1" } as any);
    await NewsPost.create({ uuid: "np-1", title: "News Post", source: "wire" } as any);
    await DraftBlogPost.create({ uuid: "dbp-1", title: "Draft", body: "draft body", draft: true } as any);

    // Sanity: all four ended up in the shared Map.
    assert.strictEqual(shared.size, 4);

    const res = await Post.query("");
    assert.strictEqual(res.results.length, 4, "Post.query must return Post + every descendant");

    // Each result rehydrates with its concrete class, not with Post.
    const byUuid = new Map(res.results.map((r: any) => [r.uuid, r]));
    assert.ok(byUuid.get("p-1") instanceof Post);
    assert.ok(!(byUuid.get("p-1") instanceof BlogPost));
    assert.ok(byUuid.get("bp-1") instanceof BlogPost);
    assert.ok(byUuid.get("bp-1") instanceof Post);
    assert.ok(byUuid.get("np-1") instanceof NewsPost);
    assert.ok(byUuid.get("dbp-1") instanceof DraftBlogPost);
    assert.ok(byUuid.get("dbp-1") instanceof BlogPost, "transitive: DraftBlogPost is a BlogPost");
  }

  /**
   * Mid-hierarchy: `BlogPost.query()` must NOT return pure Post records (an
   * ancestor outside the descendant tree) and must NOT return NewsPost
   * records (a sibling). It must return BlogPost AND DraftBlogPost (its
   * direct + transitive descendants).
   */
  @test
  async childQueryExcludesAncestorsAndSiblings() {
    this.setupSharedRepos();

    await Post.create({ uuid: "p-2", title: "ancestor" } as any);
    await BlogPost.create({ uuid: "bp-2", title: "self", body: "body" } as any);
    await NewsPost.create({ uuid: "np-2", title: "sibling", source: "wire" } as any);
    await DraftBlogPost.create({ uuid: "dbp-2", title: "transitive descendant", body: "body" } as any);

    const res = await BlogPost.query("");
    assert.strictEqual(
      res.results.length,
      2,
      `BlogPost.query must include only BlogPost + DraftBlogPost; got ${res.results.length} (` +
        res.results.map((r: any) => r.uuid).join(",") +
        ")"
    );

    const uuids = res.results.map((r: any) => r.uuid).sort();
    assert.deepStrictEqual(uuids, ["bp-2", "dbp-2"]);

    // Both surviving rows must rehydrate with their concrete class.
    const byUuid = new Map(res.results.map((r: any) => [r.uuid, r]));
    assert.ok(byUuid.get("bp-2") instanceof BlogPost);
    assert.ok(!(byUuid.get("bp-2") instanceof DraftBlogPost));
    assert.ok(byUuid.get("dbp-2") instanceof DraftBlogPost);

    // And the excluded rows must NOT have leaked through, even though they
    // physically live in the same Map.
    assert.ok(!res.results.some((r: any) => r.uuid === "p-2"), "must not return ancestor pure Post");
    assert.ok(!res.results.some((r: any) => r.uuid === "np-2"), "must not return sibling NewsPost");
  }

  /**
   * Leaf class: `DraftBlogPost.query()` returns only itself. No siblings, no
   * ancestors. Confirms the filter is symmetric across the hierarchy.
   */
  @test
  async leafQueryReturnsOnlySelf() {
    this.setupSharedRepos();

    await Post.create({ uuid: "p-3", title: "ancestor" } as any);
    await BlogPost.create({ uuid: "bp-3", title: "ancestor", body: "body" } as any);
    await DraftBlogPost.create({ uuid: "dbp-3", title: "self", body: "body" } as any);
    await DraftBlogPost.create({ uuid: "dbp-3b", title: "self2", body: "body2" } as any);

    const res = await DraftBlogPost.query("");
    assert.strictEqual(res.results.length, 2, "DraftBlogPost.query returns only its own rows");
    const uuids = res.results.map((r: any) => r.uuid).sort();
    assert.deepStrictEqual(uuids, ["dbp-3", "dbp-3b"]);
    for (const r of res.results) {
      assert.ok(r instanceof DraftBlogPost);
    }
  }

  /**
   * `<Class>.ref(uuid).get()` routes through the per-class deserializer
   * (`$serializer.type` typeKey → concrete class). The `__type` stamp comes
   * back as a NON-ENUMERABLE property on the instance — readable via direct
   * property access (which is what WebdaQL's filter eval uses) but invisible
   * to `JSON.stringify` and `Object.keys`. This test pins down both halves.
   */
  @test
  async getReturnsConcreteClassWithoutLeakingTypeStamp() {
    this.setupSharedRepos();

    await BlogPost.create({ uuid: "bp-4", title: "title", body: "body" } as any);
    const fetched = (await BlogPost.ref("bp-4").get()) as any;
    assert.ok(fetched instanceof BlogPost);
    assert.ok(fetched instanceof Post);
    assert.strictEqual(fetched.uuid, "bp-4");
    assert.strictEqual(fetched.title, "title");
    assert.strictEqual(fetched.body, "body");
    // __type IS readable (non-enumerable property access works) — that's what
    // lets WebdaQL filter on it.
    assert.strictEqual(fetched.__type, "Test/BlogPost", "__type must be readable on the instance");
    // ...but it must NOT show up as an own enumerable key, so JSON.stringify
    // and API responses don't ship it as a field.
    const ownKeys = Object.keys(fetched);
    assert.ok(!ownKeys.includes("__type"), `instance own-keys must not include __type, got: ${ownKeys.join(",")}`);
    const json = JSON.parse(JSON.stringify(fetched));
    assert.strictEqual(json.__type, undefined, "__type must not appear in JSON output");
  }

  /**
   * Legacy items written before the `__type` stamp existed must still be
   * returned by `<this.model>.query()`. The class filter is now driven by a
   * real WebdaQL `__type IN [...]` clause, so we rely on `deserialize` to
   * backfill `__type` from `this.model.Metadata.Identifier` whenever the
   * stored envelope is missing one. That makes legacy rows look like records
   * of the parent class — matching the parent's own class-filter clause.
   *
   * We simulate a legacy row by writing through the existing
   * `MemoryRepository.serialize` path (which already stamps `__type` for
   * models with Metadata), then deleting the `__type` field from the raw
   * envelope. The filter must still let the row through.
   */
  @test
  async legacyItemsWithoutTypeStampStillMatchOwnerModel() {
    const { shared, postRepo } = this.setupSharedRepos();

    // Write a Post the normal way.
    await Post.create({ uuid: "legacy-1", title: "legacy" } as any);

    // Strip __type from the stored envelope to simulate a row written by an
    // older version of the repo.
    const stored = shared.get("legacy-1")!;
    const parsed = JSON.parse(stored);
    delete parsed.__type;
    shared.set("legacy-1", JSON.stringify(parsed));

    const res = await postRepo.query("");
    assert.strictEqual(res.results.length, 1, "legacy row without __type must still be returned");
    assert.ok(res.results[0] instanceof Post);
    assert.strictEqual((res.results[0] as any).uuid, "legacy-1");
    // Backfill should land __type=Test/Post on the in-memory instance (the
    // repo's own model identifier), as a non-enumerable property so it
    // doesn't bleed into JSON output.
    assert.strictEqual((res.results[0] as any).__type, "Test/Post");
    assert.ok(!Object.keys(res.results[0]).includes("__type"));
  }

  /**
   * Defensive: a repository whose model class has no `Metadata` at all (a
   * plain unit-test class that never went through Application.setModelMetadata)
   * opts out of class filtering. Without an identifier, there's no
   * `__type IN [...]` clause to prepend, so `query()` returns every row in
   * storage — matching the pre-fix behavior for these bare classes.
   *
   * Apps that need tight class filtering must register their model through
   * Application.setModelMetadata (the production path) so the repo can build
   * a real WebdaQL clause.
   */
  @test
  async modelsWithoutMetadataReturnEverythingInStorage() {
    class PlainPost extends UuidModel {
      kind = "plain";
    }
    PlainPost.registerSerializer();
    class PlainBlog extends PlainPost {
      kind = "blog";
    }
    PlainBlog.registerSerializer();

    const shared = new Map<string, string>();
    const plainPostRepo = new MemoryRepository(PlainPost, ["uuid"], "_", shared);
    const plainBlogRepo = new MemoryRepository(PlainBlog, ["uuid"], "_", shared);
    registerRepository(PlainPost, plainPostRepo);
    registerRepository(PlainBlog, plainBlogRepo);

    try {
      await PlainPost.create({ uuid: "pp-1" } as any);
      await PlainBlog.create({ uuid: "pb-1" } as any);

      // The serialized envelope must not carry __type for these classes
      // (no Metadata.Identifier to read from), so we're guarding against the
      // regression where the stamp would always be added.
      assert.strictEqual(shared.size, 2);
      const stored = JSON.parse(shared.get("pp-1")!);
      assert.strictEqual(stored.__type, undefined, "no __type stamp without Metadata");

      // No Metadata → no class filter → every row in storage comes back from
      // both repos. This is the documented opt-out.
      const parentRes = await PlainPost.query("");
      assert.strictEqual(parentRes.results.length, 2, "no Metadata: parent repo returns every row");

      const childRes = await PlainBlog.query("");
      assert.strictEqual(childRes.results.length, 2, "no Metadata: child repo also returns every row");
    } finally {
      Repositories.delete(PlainPost);
      Repositories.delete(PlainBlog);
    }
  }

  /**
   * The same logic must hold for `iterate()`, which is the streaming-friendly
   * counterpart to `query()` and is implemented on top of it. A simple
   * smoke test: iterate from the parent class with mixed records and confirm
   * we visit every descendant; iterate from a descendant and confirm we
   * skip the rest.
   */
  @test
  async iterateAlsoFiltersByClass() {
    this.setupSharedRepos();

    await Post.create({ uuid: "p-iter", title: "p" } as any);
    await BlogPost.create({ uuid: "bp-iter", title: "bp", body: "b" } as any);
    await NewsPost.create({ uuid: "np-iter", title: "np", source: "s" } as any);
    await DraftBlogPost.create({ uuid: "dbp-iter", title: "dbp", body: "b" } as any);

    const fromParent: string[] = [];
    for await (const item of Post.iterate("")) {
      fromParent.push((item as any).uuid);
    }
    fromParent.sort();
    assert.deepStrictEqual(fromParent, ["bp-iter", "dbp-iter", "np-iter", "p-iter"]);

    const fromBlog: string[] = [];
    for await (const item of BlogPost.iterate("")) {
      fromBlog.push((item as any).uuid);
    }
    fromBlog.sort();
    assert.deepStrictEqual(fromBlog, ["bp-iter", "dbp-iter"], "iterate from BlogPost skips Post + sibling NewsPost");
  }

  /**
   * `useRepository` walks the prototype chain when a class has no repo of its
   * own. In that case the resolved repo's `this.model` is the ANCESTOR, not
   * the calling class — so the filter widens to the ancestor + its descendants.
   * This is the expected behavior: the filter is bound to the repo's model,
   * not to the call site. The `RepositoryStorageClassMixIn.query` invokes
   * the repo so this is the only knob a model has.
   *
   * The test exists to lock this contract in: a class that doesn't register
   * its own repo shares the ancestor's view rather than getting an empty one.
   */
  @test
  async prototypeWalkSharesAncestorView() {
    // Only register Post; BlogPost falls back to Post's repo via the
    // useRepository prototype walk.
    const shared = new Map<string, string>();
    const postRepo = new MemoryRepository(Post, ["uuid"], "_", shared);
    registerRepository(Post, postRepo);

    try {
      // Reach into useRepository directly to confirm the walk-up worked.
      assert.strictEqual(useRepository(BlogPost), postRepo);

      await Post.create({ uuid: "shared-1", title: "post" } as any);
      await BlogPost.create({ uuid: "shared-2", title: "blog", body: "b" } as any);

      // BlogPost.query goes through the ancestor's repo, so the prepended
      // class filter is `__type IN ['Test/Post', 'Test/BlogPost', ...]`,
      // which matches both records. This is the documented behavior — apps
      // that need a tighter filter must register a per-class repository (the
      // production path).
      const res = await BlogPost.query("");
      assert.strictEqual(res.results.length, 2);
    } finally {
      Repositories.delete(Post);
    }
  }

  /**
   * The class filter is ANDed with caller-supplied conditions, not OR'd.
   * Saving a Post and a BlogPost with the same `title` and querying by title
   * from each repo must:
   *   - `Post.query("title = 'foo'")` → returns BOTH (parent + descendant),
   *     because the `__type IN [Test/Post, Test/BlogPost, ...]` clause
   *     matches both.
   *   - `BlogPost.query("title = 'foo'")` → returns ONLY the BlogPost,
   *     because the prepended clause excludes pure `Test/Post` rows.
   *
   * This pins down that the prepend is composed correctly with arbitrary
   * caller filters via AND.
   */
  @test
  async classFilterAndsWithCallerCondition() {
    this.setupSharedRepos();

    await Post.create({ uuid: "and-p", title: "shared" } as any);
    await BlogPost.create({ uuid: "and-bp", title: "shared", body: "body" } as any);
    await Post.create({ uuid: "and-other", title: "other" } as any);

    const fromPost = await Post.query("title = 'shared'");
    const fromPostUuids = fromPost.results.map((r: any) => r.uuid).sort();
    assert.deepStrictEqual(fromPostUuids, ["and-bp", "and-p"], "Post.query AND title returns parent + descendant");

    const fromBlog = await BlogPost.query("title = 'shared'");
    const fromBlogUuids = fromBlog.results.map((r: any) => r.uuid).sort();
    assert.deepStrictEqual(fromBlogUuids, ["and-bp"], "BlogPost.query AND title excludes the pure Post row");
  }
}
