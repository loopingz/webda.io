import { describe, expect, it } from "vitest";
import type { CacheOptions } from "./cache.js";
import { WebdaClient } from "./client.js";
import { SdkError } from "./errors.js";
import { MODELS, OPERATIONS } from "./fixture.js";
import { ModelClient, withContinuation } from "./model-client.js";
import { Link, Links, projectedLink, Related, SdkModel, targetUid } from "./model.js";
import type { CallContext, ModelsManifest, OperationsManifest } from "./types.js";

/** Operations added to the fixture: a behavior action of the tasks and a nested reply */
const EXTRA_OPERATIONS: OperationsManifest = {
  ...OPERATIONS,
  "Task.AvatarUrl": {
    id: "Task.AvatarUrl",
    input: "void",
    output: "void",
    streaming: "none",
    model: "App/Task",
    kind: "action",
    rest: { method: "get", path: "/tasks/{uuid}/avatar/url", pathParams: ["uuid"] }
  },
  "Reply.Query": {
    id: "Reply.Query",
    input: "searchRequest",
    output: "App/Reply.queryResult",
    streaming: "none",
    model: "App/Reply",
    kind: "query",
    rest: { method: "get", path: "/tasks/{pid.0}/comments/{pid.1}/replies", pathParams: ["pid.0", "pid.1"] }
  }
};

/** Models added to the fixture: tasks with a behavior, replies nested under the comments */
const EXTRA_MODELS: ModelsManifest = {
  ...MODELS,
  "App/Task": {
    ...MODELS["App/Task"],
    operations: { ...MODELS["App/Task"].operations, behaviors: { "avatar.getUrl": "Task.AvatarUrl" } }
  },
  "App/Comment": {
    ...MODELS["App/Comment"],
    queries: [
      { attribute: "replies", model: "App/Reply", targetAttribute: "comment" },
      { attribute: "untargeted", model: "App/Reply" },
      { attribute: "emptyTarget", model: "App/Reply", targetAttribute: "" }
    ]
  },
  "App/Reply": {
    id: "App/Reply",
    shortName: "Reply",
    plural: "Replies",
    primaryKey: ["uuid"],
    ancestors: [],
    parent: { attribute: "comment", model: "App/Comment" },
    links: [],
    queries: [],
    dates: [],
    operations: { query: "Reply.Query", actions: {}, behaviors: {} }
  }
};

/**
 * A client over a stub transport answering by operation id
 * @param handlers - the answer of each operation
 * @param cache - cache policy
 * @returns the client, its model clients and the recorded calls
 */
function stub(handlers: Record<string, (input: any) => unknown>, cache: CacheOptions = {}) {
  const calls: Array<{ id: string; input: any; ctx: CallContext }> = [];
  const client = new WebdaClient({
    transports: [
      {
        name: "stub",
        supports: () => true,
        call: async (op, input, ctx) => {
          calls.push({ id: op.id, input, ctx });
          const handler = handlers[op.id];
          if (!handler) throw new SdkError(404, `No handler for ${op.id}`);
          return handler(input);
        }
      }
    ],
    operations: EXTRA_OPERATIONS,
    models: EXTRA_MODELS,
    cache
  });
  const model = (id: string) => {
    const modelClient = new ModelClient<any>(client, EXTRA_MODELS[id], SdkModel as any);
    client.registerModel(modelClient);
    return modelClient;
  };
  return {
    client,
    calls,
    Task: model("App/Task"),
    User: model("App/User"),
    Comment: model("App/Comment"),
    Reply: model("App/Reply"),
    Tag: model("App/Tag")
  };
}

/**
 * @param ms - delay
 * @returns after the delay
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("withContinuation", () => {
  it("replaces an existing OFFSET, quoted or escaped, and keeps the rest of the query", () => {
    expect(withContinuation("status = 'open' OFFSET \"3\"", "4")).toBe("status = 'open' OFFSET \"4\"");
    expect(withContinuation('a = 1 OFFSET "x\\"y\\\\z"  ', "n")).toBe('a = 1 OFFSET "n"');
    expect(withContinuation("a = 1 offset 'it\\'s'", undefined)).toBe("a = 1");
    expect(withContinuation("a = 1 ORDER BY b LIMIT 2 OFFSET '9'", "10")).toBe('a = 1 ORDER BY b LIMIT 2 OFFSET "10"');
    // The token is escaped, and the escaped clause is replaced again on the next page
    const next = withContinuation("a = 1", 'to"k\\en');
    expect(next).toBe('a = 1 OFFSET "to\\"k\\\\en"');
    expect(withContinuation(next, "last")).toBe('a = 1 OFFSET "last"');
  });

  it("keeps a query without an OFFSET clause", () => {
    expect(withContinuation("status = 'open'", undefined)).toBe("status = 'open'");
    expect(withContinuation("status = 'open'", "5")).toBe("status = 'open' OFFSET \"5\"");
    // Not a clause: OFFSET inside a word, or not the last clause
    expect(withContinuation('xOFFSET "1"', undefined)).toBe('xOFFSET "1"');
    expect(withContinuation('OFFSET "1" AND a = 2', undefined)).toBe('OFFSET "1" AND a = 2');
  });

  it("completes fast on long runs of blanks", () => {
    const start = Date.now();
    const blanks = " ".repeat(100_000);
    expect(withContinuation(`a${blanks}b`, undefined)).toBe(`a${blanks}b`);
    expect(withContinuation(`OFFSET${blanks}x`, undefined)).toBe(`OFFSET${blanks}x`);
    expect(withContinuation(`a OFFSET "1"${blanks}x`, undefined)).toBe(`a OFFSET "1"${blanks}x`);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("Related", () => {
  it("builds its query from a filter and the ORDER BY / LIMIT / OFFSET tail", () => {
    const { client } = stub({});
    const related = new Related(client, "App/Comment", "task", "t'1");
    expect(related.toQuery()).toBe("task = 't''1'");
    expect(related.toQuery("  text = 'a'  ")).toBe("task = 't''1' AND (text = 'a')");
    expect(related.toQuery('ORDER BY text DESC LIMIT 5 OFFSET "x"')).toBe(
      "task = 't''1' ORDER BY text DESC LIMIT 5 OFFSET \"x\""
    );
    expect(related.toQuery("a = 1 OFFSET 'z'")).toBe("task = 't''1' AND (a = 1) OFFSET 'z'");
    expect(related.toQuery("a = 1 order  by b")).toBe("task = 't''1' AND (a = 1) order  by b");
    // A keyword inside a word is not a clause
    expect(related.toQuery("limited = 1 AND offsets = 2")).toBe("task = 't''1' AND (limited = 1 AND offsets = 2)");
    expect(related.toJSON()).toBeUndefined();
  });

  it("completes fast on long runs of blanks", () => {
    const { client } = stub({});
    const related = new Related(client, "App/Comment", "task", "t1");
    const blanks = " ".repeat(100_000);
    const start = Date.now();
    expect(related.toQuery(`a${blanks}b`)).toBe(`task = 't1' AND (a${blanks}b)`);
    expect(related.toQuery(`ORDER${blanks}x`)).toBe(`task = 't1' AND (ORDER${blanks}x)`);
    expect(related.toQuery(`a = 1 LIMIT${blanks}5`)).toBe(`task = 't1' AND (a = 1) LIMIT${blanks}5`);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("sends the parents of a nested target", async () => {
    const api = stub({
      "Reply.Query": () => ({ results: [{ uuid: "r1", comment: "c1" }] }),
      "Tasks.Query": () => ({ results: [] })
    });
    // No owner: this object is a root
    await new Related(api.client, "App/Reply", "comment", "c1").query();
    expect(api.calls.at(-1)!.ctx.parents).toEqual(["c1"]);
    // Explicit parents win
    await new Related(api.client, "App/Reply", "comment", "c1", "App/Comment").query("", { parents: ["x", "c1"] });
    expect(api.calls.at(-1)!.ctx.parents).toEqual(["x", "c1"]);
    // The owner's parents cannot be resolved: no parents
    await new Related(api.client, "App/Reply", "comment", "c1", "App/Comment").query();
    expect(api.calls.at(-1)!.ctx.parents).toBeUndefined();
    // Resolved from the cached owner
    api.client.cache.setEntity("App/Comment", "c1", { uuid: "c1", task: "t1" });
    const comment = await api.Comment.get("c1", { cache: "force-cache" });
    expect(comment).not.toHaveProperty("untargeted");
    expect(comment).not.toHaveProperty("emptyTarget");
    const page = await comment.replies.query("text = 'a'");
    expect(api.calls.at(-1)).toMatchObject({
      id: "Reply.Query",
      input: { query: "comment = 'c1' AND (text = 'a')" },
      ctx: { parents: ["t1", "c1"] }
    });
    expect(page.results[0].comment).toBeInstanceOf(Link);
    // Not nested under this object: options are kept
    await new Related(api.client, "App/Task", "owner", "u1", "App/User").query();
    expect(api.calls.at(-1)!.ctx.parents).toBeUndefined();
  });
});

describe("projectedLink", () => {
  it("computes the uid of unknown and composite models", () => {
    const { client } = stub({});
    expect(targetUid(client, "App/Unknown", { uuid: "x" })).toBe("x");
    expect(targetUid(client, "App/Tag", { org: "acme", slug: "news" })).toBe("acme/news");
    expect(projectedLink(client, "App/User", "u1").uid).toBe("u1");
    expect(projectedLink(client, "App/User", null).uid).toBe("null");
  });

  it("exposes the projected attributes and refreshes the cached target only when they change", () => {
    const { client } = stub({});
    const events: unknown[] = [];
    client.on("change", event => events.push(event));
    // Not cached: nothing to refresh
    const link = projectedLink(client, "App/User", { uuid: "u1", name: "Alice", model: "hijack" }) as any;
    expect(link).toBeInstanceOf(Link);
    expect(link.name).toBe("Alice");
    // Attributes of the link itself are kept
    expect(link.model).toBe("App/User");
    expect(client.cache.getEntity("App/User", "u1")).toBeUndefined();
    client.cache.setEntity("App/User", "u1", { uuid: "u1", name: "Alice", age: 3 });
    events.length = 0;
    // Same values: no write
    projectedLink(client, "App/User", { uuid: "u1", name: "Alice" });
    expect(events).toEqual([]);
    // A changed value: merged
    projectedLink(client, "App/User", { uuid: "u1", name: "Bob" });
    expect(client.cache.getEntity("App/User", "u1")?.data).toEqual({ uuid: "u1", name: "Bob", age: 3 });
    expect(events).toEqual([{ model: "App/User", uid: "u1", type: "set" }]);
  });
});

describe("SdkModel", () => {
  it("hydrates nulls, undefined, dates, projected links and object items of simple link arrays", async () => {
    const due = new Date("2020-01-01");
    const api = stub({
      "Task.Get": () => ({ uuid: "t1", title: undefined, due: null, owner: { uuid: "u1", name: "Alice" } }),
      "User.Get": () => ({ uuid: "u1", friends: [{ uuid: "u2" }, "u3"], roles: null }),
      "Comment.Get": () => ({ uuid: "c1", task: null })
    });
    const task = await api.Task.get("t1");
    expect("title" in task).toBe(false);
    expect(task.due).toBeNull();
    expect(task.owner).toBeInstanceOf(Link);
    expect(task.owner.name).toBe("Alice");
    task.hydrate({ due });
    expect(task.due).toBe(due);
    // Own functions are not attributes
    task.helper = () => 1;
    expect(task.toJSON()).not.toHaveProperty("helper");
    const user = await api.User.get("u1");
    expect(user.friends).toBeInstanceOf(Links);
    expect(user.friends.map((friend: Link) => friend.uid)).toEqual(["u2", "u3"]);
    expect(user.roles).toBeNull();
    const comment = await api.Comment.get("c1", { parents: ["t1"] });
    expect(comment.task).toBeNull();
    expect(comment.getParents()).toBeUndefined();
  });
});

describe("ModelClient", () => {
  it("caches a projected get only over a cached entity", async () => {
    const api = stub({ "Task.Get": () => ({ uuid: "t1", title: "one" }) }, { ttl: 60_000 });
    await api.Task.get("t1", { select: ["title"] });
    expect(api.client.cache.getEntity("App/Task", "t1")).toBeUndefined();
    // An empty selection is a full get
    await api.Task.get("t1", { select: [] });
    expect(api.client.cache.getEntity("App/Task", "t1")?.data).toEqual({ uuid: "t1", title: "one" });
    api.client.cache.mergeEntity("App/Task", "t1", { status: "open" });
    await api.Task.get("t1", { select: ["title"], cache: "reload" });
    expect(api.client.cache.getEntity("App/Task", "t1")?.data).toEqual({ uuid: "t1", title: "one", status: "open" });
    expect(api.calls).toHaveLength(3);
  });

  it("queries without caching projected, no-store or empty pages", async () => {
    let page: unknown = { results: [{ uuid: "t1", title: "one" }], continuationToken: "2" };
    const api = stub({ "Tasks.Query": () => page }, { ttl: 60_000 });
    // Projected: the entities are not cached, nor the page
    expect((await api.Task.query("", { select: ["title"] })).continuationToken).toBe("2");
    expect(api.client.cache.getQuery("App/Task", "")).toBeUndefined();
    expect(api.client.cache.getEntity("App/Task", "t1")).toBeUndefined();
    // no-store
    await api.Task.query("", { cache: "no-store" });
    expect(api.client.cache.getQuery("App/Task", "")).toBeUndefined();
    // Cached, then reloaded
    await api.Task.query("");
    expect(api.client.cache.getQuery("App/Task", "")).toMatchObject({ uids: ["t1"], continuationToken: "2" });
    await api.Task.query("", { cache: "reload" });
    expect(api.calls).toHaveLength(4);
    // An empty answer is an empty page
    page = undefined;
    expect(await api.Task.query("nothing")).toEqual({ results: [], continuationToken: undefined });
  });

  it("asks for the total only with count, and keeps it for the next pages", async () => {
    const api = stub(
      {
        "Tasks.Query": (input: any) => ({
          results: [{ uuid: input.query.includes("OFFSET") ? "t2" : "t1" }],
          continuationToken: input.query.includes("OFFSET") ? undefined : "next",
          ...(input.count ? { total: { value: 2, relation: "eq" } } : {})
        })
      },
      { ttl: 60_000 }
    );
    // Without count: no count asked, no total
    const plain = await api.Task.query("LIMIT 1", { cache: "no-store" });
    expect(plain.total).toBeUndefined();
    expect(api.calls[0].input).toEqual({ query: "LIMIT 1" });
    // First page with count
    const first = await api.Task.query("LIMIT 1", { count: true });
    expect(api.calls[1].input).toEqual({ query: "LIMIT 1", count: true });
    expect(first.total).toEqual({ value: 2, relation: "eq" });
    expect(api.client.cache.getQuery("App/Task", "LIMIT 1")).toMatchObject({ total: { value: 2, relation: "eq" } });
    // Served from the cache with its total
    expect((await api.Task.query("LIMIT 1", { count: true })).total).toEqual({ value: 2, relation: "eq" });
    expect(api.calls).toHaveLength(2);
    // The next page reuses the cached total: the server is not asked to count again
    const next = await api.Task.query(withContinuation("LIMIT 1", first.continuationToken), { count: true });
    expect(next.results[0].uuid).toBe("t2");
    expect(api.calls[2].input).toEqual({ query: 'LIMIT 1 OFFSET "next"' });
    expect(next.total).toEqual({ value: 2, relation: "eq" });
    // A cached page without total is fetched again when the total is asked
    await api.Task.query("status = 'x'");
    expect((await api.Task.query("status = 'x'", { count: true })).total).toEqual({ value: 2, relation: "eq" });
    expect(api.calls.slice(-1)[0].input).toEqual({ query: "status = 'x'", count: true });
  });

  it.each([false, true])("keeps per-caller totals for concurrent next pages (count first: %s)", async countFirst => {
    let release!: (page: unknown) => void;
    const response = new Promise(resolve => (release = resolve));
    const api = stub({ "Tasks.Query": () => response }, { ttl: 60_000 });
    api.client.cache.setQuery("App/Task", "LIMIT 1", [], "next", { value: 2, relation: "eq" });
    const query = withContinuation("LIMIT 1", "next");
    const requests = countFirst ? [true, false] : [false, true];
    const first = api.Task.query(query, { count: requests[0] });
    const second = api.Task.query(query, { count: requests[1] });
    release({ results: [{ uuid: "t2" }] });
    const pages = await Promise.all([first, second]);
    for (let i = 0; i < requests.length; i++) {
      expect(pages[i].total).toEqual(requests[i] ? { value: 2, relation: "eq" } : undefined);
    }
  });

  it.each([
    { ttl: 0, mode: "default" as const, expected: 3 },
    { ttl: 60_000, mode: "reload" as const, expected: 3 },
    { ttl: 0, mode: "force-cache" as const, expected: 2 }
  ])("respects the total cache policy %j", async ({ ttl, mode, expected }) => {
    const api = stub(
      { "Tasks.Query": input => ({ results: [], ...(input.count ? { total: { value: 3, relation: "eq" } } : {}) }) },
      { ttl }
    );
    api.client.cache.setQuery("App/Task", "LIMIT 1", [], "next", { value: 2, relation: "eq" });
    const page = await api.Task.query(withContinuation("LIMIT 1", "next"), { count: true, cache: mode });
    expect(api.calls[0].input.count).toBe(expected === 3 ? true : undefined);
    expect(page.total).toEqual({ value: expected, relation: "eq" });
  });

  it("drops a null total", async () => {
    const api = stub({ "Tasks.Query": () => ({ results: [], total: null }) });
    expect(await api.Task.query("", { count: true })).toEqual({ results: [], continuationToken: undefined });
  });

  it("serves a stale page and revalidates it in the background", async () => {
    let fail = false;
    const api = stub(
      {
        "Tasks.Query": () => {
          if (fail) throw new SdkError(500, "down");
          return { results: [{ uuid: "t1", title: "one" }] };
        }
      },
      { ttl: 1, staleWhileRevalidate: true }
    );
    await api.Task.query("");
    await sleep(5);
    const stale = await api.Task.query("");
    expect(stale.results[0].title).toBe("one");
    await sleep(5);
    expect(api.calls).toHaveLength(2);
    // The background refresh failure is not the caller's
    fail = true;
    expect((await api.Task.query("")).results).toHaveLength(1);
    await sleep(5);
    expect(api.calls).toHaveLength(3);
    // A stale page whose entity is gone is fetched
    fail = false;
    api.client.cache.deleteEntity("App/Task", "t1");
    await sleep(5);
    expect((await api.Task.query("")).results[0].title).toBe("one");
    expect(api.calls).toHaveLength(4);
  });

  it("falls back to the sent data when a mutation answers nothing", async () => {
    const api = stub({
      "Task.Create": () => undefined,
      "Task.Update": () => undefined,
      "Task.Patch": () => ({})
    });
    expect((await api.Task.create({ uuid: "t5", title: "five" })).title).toBe("five");
    expect(api.client.cache.getEntity("App/Task", "t5")?.data).toEqual({ uuid: "t5", title: "five" });
    expect((await api.Task.update("t5", { title: "FIVE" })).toJSON()).toEqual({ title: "FIVE", uuid: "t5" });
    const patched = await api.Task.patch("t5", { status: "done" });
    expect(patched.toJSON()).toEqual({ title: "FIVE", status: "done", uuid: "t5" });
  });

  it("calls behavior actions and caches only object outputs carrying the primary key", async () => {
    const api = stub({
      "Task.AvatarUrl": input => (input.uuid === "list" ? ["a"] : input.uuid === "url" ? "https://cdn/x" : { ok: 1 }),
      "Task.Archive": input => ({ ...input, status: "archived" })
    });
    expect(await api.Task.behavior("avatar", "getUrl", "url")).toBe("https://cdn/x");
    expect(await api.Task.behavior("avatar", "getUrl", "list")).toEqual(["a"]);
    expect(await api.Task.behavior("avatar", "getUrl", "t1", { size: 2 })).toEqual({ ok: 1 });
    expect(api.calls.at(-1)!.input).toEqual({ size: 2, uuid: "t1" });
    expect(api.client.cache.getEntity("App/Task", "t1")).toBeUndefined();
    // An object primary key is sent as is
    expect(await api.Task.action("archive", { uuid: "t2" }, { reason: "old" })).toEqual({
      reason: "old",
      uuid: "t2",
      status: "archived"
    });
    expect(api.client.cache.getEntity("App/Task", "t2")?.data.status).toBe("archived");
  });
});
