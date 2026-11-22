import { expect, vi } from "vitest";
import { suite, test } from "@webda/test";
import { Mock, ModelLink, RelationRepository } from "@webda/models";
import { generate } from "./generate.js";
import { generateGraph } from "./graph.js";
import { SessionPool } from "./pool.js";

class Person {
  @Mock.firstName accessor firstName!: string;
  @Mock.lastName accessor lastName!: string;
  @Mock.email accessor email!: string;
  @Mock.integer({ min: 18, max: 99 }) accessor age!: number;
}

class NoHints {
  accessor firstName!: string;
  accessor email!: string;
  accessor age!: number;
}

@suite("generate")
class GenerateTest {
  @test({ name: "produces `count` instances of the requested class" })
  async count() {
    const people = await generate(Person, { count: 5, seed: 1, mode: "test" });
    expect(people.length).toBe(5);
    for (const p of people) expect(p).toBeInstanceOf(Person);
  }

  @test({ name: "deterministic with the same seed" })
  async deterministic() {
    const a = await generate(Person, { count: 3, seed: 42, mode: "test" });
    const b = await generate(Person, { count: 3, seed: 42, mode: "test" });
    expect(a.map(x => x.email)).toEqual(b.map(x => x.email));
  }

  @test({ name: "applies overrides to every generated record" })
  async overrides() {
    const people = await generate(Person, {
      count: 2,
      seed: 1,
      mode: "test",
      overrides: { lastName: "FIXED" }
    });
    for (const p of people) expect(p.lastName).toBe("FIXED");
  }

  @test({ name: "auto-infers from field name when no @Mock decorator is present" })
  async autoInfer() {
    const records = await generate(NoHints, { count: 1, seed: 1, mode: "test" });
    const r = records[0];
    expect(typeof r.firstName).toBe("string");
    expect(r.firstName.length).toBeGreaterThan(0);
    expect(r.email).toMatch(/@/);
    expect(Number.isInteger(r.age)).toBe(true);
  }

  @test({ name: "strict mode throws on unhinted, unknown fields" })
  async strict() {
    class Mystery {
      accessor weirdField!: { some: "object" };
    }
    await expect(generate(Mystery, { count: 1, mode: "test", strict: true })).rejects.toThrow(/weirdField/);
  }

  @test({ name: "test mode throws when a field uses @Mock.ai" })
  async aiInTestMode() {
    class WithAI {
      @Mock.ai({ prompt: "a short bio" }) accessor bio!: string;
    }
    await expect(generate(WithAI, { count: 1, mode: "test" })).rejects.toThrow(/ai/i);
  }

  @test({ name: "resolves all MockKind variants and non-strict unknown fields" })
  async allKindsAndBranches() {
    class AllKinds {
      @Mock.uuid accessor id!: string;
      @Mock.fullName accessor fullName!: string;
      @Mock.phone accessor phone!: string;
      @Mock.url accessor url!: string;
      @Mock.avatar accessor avatar!: string;
      @Mock.lorem({ paragraphs: 1 }) accessor loremPara!: string;
      @Mock.lorem({ sentences: 2 }) accessor loremSent!: string;
      @Mock.lorem({ words: 4 }) accessor loremWords!: string;
      @Mock.pastDate({ within: "year" }) accessor pastYear!: Date;
      @Mock.pastDate({ within: "month" }) accessor pastMonth!: Date;
      @Mock.pastDate({ within: "week" }) accessor pastWeek!: Date;
      @Mock.pastDate({ within: "day" }) accessor pastDay!: Date;
      @Mock.futureDate({ within: "year" }) accessor futureYear!: Date;
      @Mock.pick(["a", "b"]) accessor picked!: string;
      @Mock({ kind: "boolean" }) accessor flag!: boolean;
      @Mock.custom(ctx => `idx-${ctx.index}`) accessor customField!: string;
      @Mock.ai({ prompt: "bio", maxTokens: 50 }) accessor bio!: string;
      @Mock({ kind: "nonexistent" }) accessor unknownKindField!: unknown;
      accessor unknownUnhinted!: { x: number };
    }

    // Missing AI provider in dev mode throws inside aiFn
    await expect(generate(AllKinds, { mode: "dev" })).rejects.toThrow(/no AIProvider/);

    const [row] = await generate(AllKinds, {
      mode: "dev",
      seed: 123,
      ai: { complete: async () => "ai-text" }
    });
    expect(typeof row.id).toBe("string");
    expect(typeof row.fullName).toBe("string");
    expect(typeof row.phone).toBe("string");
    expect(typeof row.url).toBe("string");
    expect(typeof row.avatar).toBe("string");
    expect(typeof row.loremPara).toBe("string");
    expect(typeof row.loremSent).toBe("string");
    expect(typeof row.loremWords).toBe("string");
    expect(row.pastYear).toBeInstanceOf(Date);
    expect(row.futureYear).toBeInstanceOf(Date);
    expect(["a", "b"]).toContain(row.picked);
    expect(typeof row.flag).toBe("boolean");
    expect(row.customField).toBe("idx-0");
    expect(row.bio).toBe("ai-text");
    expect((row as any).unknownKindField).toBeUndefined();
  }

  @test({ name: "mode defaults to test under vitest and to dev otherwise" })
  async defaultMode() {
    class WithAI {
      @Mock.ai({ prompt: "a short bio" }) accessor bio!: string;
    }
    // Under vitest: test mode, seed 0 → deterministic and @Mock.ai forbidden
    const a = await generate(Person);
    const b = await generate(Person);
    expect(a).toHaveLength(1);
    expect(a[0].email).toBe(b[0].email);
    await expect(generate(WithAI)).rejects.toThrow(/mode="test" forbids @Mock.ai/);

    vi.stubEnv("VITEST", "");
    try {
      // Outside vitest: dev mode, @Mock.ai is allowed and delegates to the provider
      const [row] = await generate(WithAI, { ai: { complete: async () => "dev-bio" } });
      expect(row.bio).toBe("dev-bio");
    } finally {
      vi.unstubAllEnvs();
    }
  }

  @test({ name: "only getter/setter pairs on the prototype are treated as fields" })
  async prototypeMembers() {
    class WithMembers {
      @Mock.email accessor email!: string;
      get firstName(): string {
        return "computed";
      }
      lastName(): string {
        return "method";
      }
    }
    const [row] = await generate(WithMembers, { seed: 1, mode: "test", strict: true });
    expect(row.email).toMatch(/@/);
    expect(row.firstName).toBe("computed");
    expect(row.lastName()).toBe("method");
  }

  @test({ name: "kinds fall back to their default options" })
  async defaultKindOptions() {
    class Defaults {
      @Mock.lorem() accessor words!: string;
      @Mock.float() accessor ratio!: number;
      @Mock.float({ min: 200, max: 300 }) accessor bounded!: number;
      @Mock.pastDate() accessor past!: Date;
      @Mock.futureDate() accessor future!: Date;
    }
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    const [row] = await generate(Defaults, { seed: 7, mode: "test" });
    expect(row.words.split(" ")).toHaveLength(3);
    expect(row.ratio).toBeGreaterThanOrEqual(0);
    expect(row.ratio).toBeLessThanOrEqual(100);
    expect(row.bounded).toBeGreaterThanOrEqual(200);
    expect(row.bounded).toBeLessThanOrEqual(300);
    expect(row.past.getTime()).toBeLessThan(now + 1000);
    expect(row.past.getTime()).toBeGreaterThan(now - 367 * day);
    expect(row.future.getTime()).toBeLessThan(now + 367 * day);
    expect(row.future.getTime()).toBeGreaterThan(now - 1000);
  }

  @test({ name: "internal fields are only generated when explicitly decorated" })
  async internalFields() {
    class Account {
      @Mock.email accessor email!: string;
      _mfaAttempts = 0;
      accessor _escrowAttempts: number = 0;
      __secret: string = "";
      @Mock.integer({ min: 5, max: 5 }) accessor _seeded!: number;
    }
    const [row] = await generate(Account, { seed: 1, mode: "test" });
    expect(row.email).toMatch(/@/);
    expect(row._mfaAttempts).toBe(0);
    expect(row._escrowAttempts).toBe(0);
    expect(row.__secret).toBe("");
    expect(row._seeded).toBe(5);
    // Strict mode does not require a hint for internal fields
    await expect(generate(Account, { seed: 1, mode: "test", strict: true })).resolves.toHaveLength(1);
  }

  @test({ name: "linkExisting picks from the pool, linkNew creates, count fills arrays" })
  async relations() {
    class Author {
      @Mock.uuid accessor uuid!: string;
    }
    class Post {
      @Mock({ kind: "linkExisting", options: { model: Author } }) accessor author!: Author;
      @Mock({ kind: "linkNew", options: { model: () => Author } }) accessor editor!: Author;
      @Mock({ kind: "count", options: { n: 2, model: Author } }) accessor reviewers!: Author[];
      @Mock({ kind: "count", options: { min: 1, max: 1, model: Author } }) accessor readers!: Author[];
    }
    const graph = await generateGraph({ Author: 3, Post: 4 }, { models: [Author, Post], seed: 3, mode: "test" });
    const authors = graph.Author as Author[];
    const posts = graph.Post as Post[];
    // The first post links one of the requested authors; later ones may also link authors created by linkNew
    expect(authors).toContain(posts[0].author);
    for (const post of posts) {
      expect(post.author).toBeInstanceOf(Author);
      expect(post.editor).toBeInstanceOf(Author);
      expect(authors).not.toContain(post.editor);
      expect(post.reviewers).toHaveLength(2);
      expect(new Set(post.reviewers).size).toBe(2);
      expect(post.readers).toHaveLength(1);
    }
  }

  @test({ name: "relations create instances when the pool is short" })
  async relationsEmptyPool() {
    class Tag {
      @Mock.word accessor label!: string;
    }
    class Note {
      @Mock({ kind: "linkExisting", options: { model: Tag } }) accessor tag!: Tag;
      @Mock({ kind: "count", options: { n: 3, model: Tag } }) accessor tags!: Tag[];
      @Mock({ kind: "count", options: { model: Tag } }) accessor extra: Tag[] = [];
    }
    const pool = new SessionPool();
    const [note] = await generate(Note, { seed: 2, mode: "test", pool });
    expect(note.tag).toBeInstanceOf(Tag);
    expect(note.tags).toHaveLength(3);
    expect(note.extra.length).toBeGreaterThanOrEqual(0);
    expect(note.extra.length).toBeLessThanOrEqual(3);
    // tag created one, tags reused it and created two more
    expect(note.tags).toContain(note.tag);
    expect(pool.size(Tag)).toBeGreaterThanOrEqual(3);
  }

  @test({ name: "relation objects are set in place and their target is inferred" })
  async relationObjects() {
    class Owner {
      @Mock.uuid accessor uuid!: string;
    }
    const links = { [RelationRepository]: { getRootModel: () => Owner }, set: vi.fn() };
    const related = { getQuery: () => "" };
    class Item {
      @Mock.linkExisting owner = new ModelLink(Owner);
      @Mock.count(2) links = links;
      @Mock.linkNew related = related;
    }
    const [item] = await generate(Item, { seed: 4, mode: "test" });
    expect(item.owner.getPrimaryKey()).toBeInstanceOf(Owner);
    expect(links.set).toHaveBeenCalledOnce();
    expect(links.set.mock.calls[0][0]).toHaveLength(2);
    expect(item.related).toBe(related);
  }

  @test({ name: "a relation without a resolvable target throws" })
  async relationWithoutTarget() {
    class Orphan {
      @Mock.linkExisting accessor parent!: unknown;
    }
    await expect(generate(Orphan, { seed: 1, mode: "test" })).rejects.toThrow(
      /target model of relation field "parent"/
    );
  }

  @test({ name: "linkNew cycles stop after a few levels" })
  async relationCycle() {
    class Node {
      @Mock.uuid accessor uuid!: string;
      @Mock({ kind: "linkNew", options: { model: () => Node } }) accessor next!: Node;
      @Mock({ kind: "count", options: { n: 1, model: () => Other } }) accessor others!: unknown[];
    }
    class Other {
      @Mock({ kind: "linkExisting", options: { model: () => Missing } }) accessor missing!: unknown;
    }
    class Missing {}
    const [root] = await generate(Node, { seed: 5, mode: "test" });
    let depth = 0;
    for (let n: Node | undefined = root; n; n = n.next) depth++;
    expect(depth).toBe(4);
  }
}
