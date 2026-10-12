import { escape as qlEscape } from "@webda/ql";
import { describe, expect, it } from "vitest";
import { WebdaClient } from "./client.js";
import { SdkError } from "./errors.js";
import { FakeServer, MODELS, OPERATIONS } from "./fixture.js";
import { HttpTransport } from "./http.js";
import { ModelClient, withContinuation } from "./model-client.js";
import { Link, Links, LinksArray, LinksMap, quoteValue, Related, SdkModel } from "./model.js";

/** The generated classes of the fixture */
class Task extends SdkModel<{ uuid: string; title: string; status?: string; due?: Date; owner?: Link<User> }> {
  declare uuid: string;
  declare title: string;
  declare status?: string;
  declare due?: Date;
  declare owner?: Link<User>;
  declare comments: Related<Comment>;

  /** A shared method
   * @param now - the date
   * @returns true when overdue
   */
  isOverdue(now: Date = new Date()): boolean {
    return this.status !== "done" && this.due !== undefined && this.due < now;
  }
}
class User extends SdkModel {
  declare uuid: string;
  declare name: string;
  declare friends: Links<User>;
  declare roles: LinksArray<User, { role: string }>;
  declare contacts: LinksMap<User, { label: string }>;
  declare tasks: Related<Task>;
}
class Comment extends SdkModel {
  declare uuid: string;
  declare task: Link<Task>;
  declare text: string;
}
class Tag extends SdkModel {
  declare org: string;
  declare slug: string;
}

/**
 * @param server - the fake server
 * @param cache - cache options
 * @returns a client with the fixture models registered
 */
function setup(server: FakeServer, cache: { ttl?: number; staleWhileRevalidate?: boolean } = {}) {
  const client = new WebdaClient({
    baseUrl: "https://api.test",
    fetch: server.fetch(),
    operations: OPERATIONS,
    models: MODELS,
    cache
  });
  const api = Object.assign(client, {
    Task: new ModelClient<Task>(client, MODELS["App/Task"], Task),
    User: new ModelClient<User>(client, MODELS["App/User"], User),
    Comment: new ModelClient<Comment>(client, MODELS["App/Comment"], Comment),
    Tag: new ModelClient<Tag>(client, MODELS["App/Tag"], Tag)
  });
  for (const model of [api.Task, api.User, api.Comment, api.Tag]) client.registerModel(model);
  return api;
}

/**
 * @returns a server with a task store
 */
function taskServer() {
  const tasks: Record<string, any> = {
    t1: { uuid: "t1", title: "one", status: "open", due: "2020-01-01T00:00:00.000Z", owner: "u1" },
    t2: { uuid: "t2", title: "two", status: "done", owner: "u1" }
  };
  const server = new FakeServer()
    .on("GET", "/tasks/:uuid", m => tasks[m[1]] ?? new Response('{"error":{"message":"missing"}}', { status: 404 }))
    .on("GET", "/tasks", (_, req) => {
      const q = new URL(req.url).searchParams.get("q") ?? "";
      const all = Object.values(tasks).filter(t => !q.includes("open") || t.status === "open");
      const offset = Number(/OFFSET "(\d+)"/.exec(q)?.[1] ?? 0);
      const page = all.slice(offset, offset + 1);
      return { results: page, continuationToken: offset + 1 < all.length ? String(offset + 1) : undefined };
    })
    .on("POST", "/tasks", (_, req) => (tasks[req.body.uuid ?? "new"] = { uuid: "new", ...req.body }))
    .on("PUT", "/tasks/count", () => ({ count: Object.keys(tasks).length }))
    .on("PUT", "/tasks/:uuid", (m, req) => (tasks[m[1]] = { uuid: m[1], ...req.body }))
    .on("PATCH", "/tasks/:uuid", (m, req) => (tasks[m[1]] = { ...tasks[m[1]], ...req.body }))
    .on("DELETE", "/tasks/:uuid", m => void delete tasks[m[1]])
    .on(
      "PUT",
      "/tasks/:uuid/archive",
      (m, req) => (tasks[m[1]] = { ...tasks[m[1]], status: "archived", reason: req.body.reason })
    )
    .on("GET", "/users/:uuid", m => ({
      uuid: m[1],
      name: "Alice",
      friends: ["u2"],
      roles: [{ uuid: "u2", role: "admin" }],
      contacts: { boss: { uuid: "u3", label: "Boss" } }
    }))
    .on("PUT", "/users", () => ({ results: [{ uuid: "u1", name: "Alice" }] }))
    .on("GET", "/tasks/:pid/comments/:uuid", m => ({ uuid: m[2], task: m[1], text: "hi" }))
    .on("POST", "/tasks/:pid/comments", (m, req) => ({ uuid: "c9", task: m[1], ...req.body }))
    .on("GET", "/tags/:org/:slug", m => ({ org: m[1], slug: m[2] }))
    .on("GET", "/auth/me", () => ({ uuid: "u1", name: "Alice" }));
  return { server, tasks };
}

describe("WebdaClient", () => {
  it("rejects unknown operations and operations no transport carries", async () => {
    const api = setup(new FakeServer());
    await expect(api.call("Unknown" as any)).rejects.toThrow(/Operation Unknown is unknown/);
    await expect(api.call("Hidden.Op")).rejects.toThrow(/not exposed on the configured transports \(rest\)/);
    await expect(api.call("Audit.Upload")).rejects.toThrow(/client stream/);
    await expect(api.call("Audit.Chat")).rejects.toThrow(/use connect\(\)/);
    expect(() => api.model("App/Nope")).toThrow(SdkError);
    expect(() => api.descriptor("App/Nope")).toThrow(SdkError);
    expect(api.descriptor("App/Task").plural).toBe("Tasks");
  });

  it("picks the first transport supporting the operation", async () => {
    const calls: string[] = [];
    const first = {
      name: "first",
      supports: (op: any) => op.id === "Auth.Me",
      call: async () => (calls.push("first"), { uuid: "u1" })
    };
    const second = new HttpTransport({ baseUrl: "https://api.test", fetch: taskServer().server.fetch() });
    const client = new WebdaClient({ transports: [first, second], operations: OPERATIONS, models: MODELS });
    expect(await client.call("Auth.Me")).toEqual({ uuid: "u1" });
    expect(await client.call("Task.Get", { uuid: "t1" })).toMatchObject({ uuid: "t1" });
    expect(calls).toEqual(["first"]);
    expect(() => client.stream("Hidden.Op")).toThrow(/not exposed/);
    expect(() => client.connect("Hidden.Op")).toThrow(/not exposed/);
  });

  it("serves a second get within the ttl from the cache and deduplicates concurrent gets", async () => {
    const { server } = taskServer();
    const api = setup(server, { ttl: 60_000 });
    const [a, b] = await Promise.all([api.Task.get("t1"), api.Task.get("t1")]);
    expect(a.title).toBe("one");
    expect(a).toBeInstanceOf(Task);
    expect(b.toJSON()).toEqual(a.toJSON());
    expect(server.requests).toHaveLength(1);
    await api.Task.get("t1");
    expect(server.requests).toHaveLength(1);
    await api.Task.get("t1", { cache: "reload" });
    expect(server.requests).toHaveLength(2);
    await api.Task.get("t1", { cache: "no-store" });
    expect(server.requests).toHaveLength(3);
    // ttl 0: always revalidates, still deduplicating concurrent requests
    const fresh = setup(server);
    server.requests.length = 0;
    await Promise.all([fresh.Task.get("t1"), fresh.Task.get("t1")]);
    await fresh.Task.get("t1");
    expect(server.requests).toHaveLength(2);
    await fresh.Task.get("t1", { cache: "force-cache" });
    expect(server.requests).toHaveLength(2);
  });

  it("serves a stale entry and revalidates in the background", async () => {
    const { server, tasks } = taskServer();
    const api = setup(server, { ttl: 1, staleWhileRevalidate: true });
    await api.Task.get("t1");
    await new Promise(resolve => setTimeout(resolve, 5));
    tasks.t1.title = "updated";
    const stale = await api.Task.get("t1");
    expect(stale.title).toBe("one");
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(api.cache.getEntity("App/Task", "t1")?.data.title).toBe("updated");
    expect(server.requests).toHaveLength(2);
  });

  it("hydrates dates, links and related queries", async () => {
    const { server } = taskServer();
    const api = setup(server);
    const task = await api.Task.get("t1");
    expect(task.due).toBeInstanceOf(Date);
    expect(task.isOverdue(new Date("2021-01-01"))).toBe(true);
    expect(task.owner).toBeInstanceOf(Link);
    expect(String(task.owner)).toBe("u1");
    expect(task.toJSON()).toEqual({ uuid: "t1", title: "one", status: "open", due: task.due, owner: task.owner });
    expect(JSON.parse(JSON.stringify(task))).toEqual({
      uuid: "t1",
      title: "one",
      status: "open",
      due: "2020-01-01T00:00:00.000Z",
      owner: "u1"
    });
    expect(task.getUUID()).toBe("t1");
    expect(task.getPrimaryKey()).toBe("t1");
    expect(task.getClient()).toBe(api.Task);
    expect(task.getParents()).toBeUndefined();
    const owner = await task.owner!.get();
    expect(owner).toBeInstanceOf(User);
    expect(owner.name).toBe("Alice");
    expect(owner.friends).toBeInstanceOf(Links);
    expect(owner.friends.map(f => f.uid)).toEqual(["u2"]);
    expect(owner.roles[0].role).toBe("admin");
    expect(owner.roles[0].uid).toBe("u2");
    expect(owner.contacts.get("boss")?.label).toBe("Boss");
    expect(owner.contacts.keys()).toEqual(["boss"]);
    expect(JSON.parse(JSON.stringify(owner))).toEqual({
      uuid: "u1",
      name: "Alice",
      friends: ["u2"],
      roles: [{ uuid: "u2", role: "admin" }],
      contacts: { boss: { uuid: "u3", label: "Boss" } }
    });
    expect((await owner.friends.getAll())[0].uuid).toBe("u2");
    expect((await owner.roles.getAll())[0].uuid).toBe("u2");
    expect((await owner.contacts.getAll()).boss.uuid).toBe("u3");
    expect(owner.contacts.values()).toHaveLength(1);
    // Related: the query targets the other model through the client
    expect(task.comments).toBeInstanceOf(Related);
    expect(task.comments.toQuery()).toBe("task = 't1'");
    expect(task.comments.toQuery("text LIKE 'a%' ORDER BY text LIMIT 5")).toBe(
      "task = 't1' AND (text LIKE 'a%') ORDER BY text LIMIT 5"
    );
    expect(task.comments.toQuery("LIMIT 5")).toBe("task = 't1' LIMIT 5");
    const page = await owner.tasks.query("status = 'open'");
    expect(page.results.map(t => t.uuid)).toEqual(["t1"]);
    expect(new URL(server.requests.at(-1)!.url).searchParams.get("q")).toBe("owner = 'u1' AND (status = 'open')");
    const all: string[] = [];
    for await (const t of owner.tasks.iterate()) all.push(t.uuid);
    expect(all).toEqual(["t1", "t2"]);
  });

  it("quotes values like @webda/ql escapes them", () => {
    for (const value of ["plain", "it's", "back\\slash", "both\\'s"]) {
      expect(quoteValue(value)).toBe(qlEscape(["", ""], [value]));
    }
  });

  it("queries, caches the pages as uids and iterates with continuation tokens", async () => {
    const { server } = taskServer();
    const api = setup(server, { ttl: 60_000 });
    const page = await api.Task.query("status = 'open'");
    expect(page.results[0]).toBeInstanceOf(Task);
    expect(page.continuationToken).toBeUndefined();
    await api.Task.query("status = 'open'");
    expect(server.requests).toHaveLength(1);
    const task = await api.Task.get("t1");
    expect(task.title).toBe("one");
    expect(server.requests).toHaveLength(1);
    const all: string[] = [];
    for await (const t of api.Task.iterate()) all.push(t.uuid);
    expect(all).toEqual(["t1", "t2"]);
    expect(withContinuation("status = 'open' OFFSET \"3\"", "4")).toBe("status = 'open' OFFSET \"4\"");
    expect(withContinuation("a = 1 OFFSET 'x'", undefined)).toBe("a = 1");
    expect(api.Task.keys.query("q")).toEqual(["App/Task", "query", "q"]);
    expect(api.Task.keys.get("t1")).toEqual(["App/Task", "get", "t1"]);
    expect(await api.Task.queryFn.get("t1")()).toBeInstanceOf(Task);
    expect((await api.Task.queryFn.query("")()).results).toHaveLength(1);
    // A cached page whose entity was evicted is fetched again
    api.cache.deleteEntity("App/Task", "t1");
    server.requests.length = 0;
    await api.Task.query("status = 'open'");
    expect(server.requests).toHaveLength(1);
  });

  it("patch merges the entity, invalidates the model and ancestor queries and emits change", async () => {
    const { server } = taskServer();
    const api = setup(server, { ttl: 60_000 });
    const events: unknown[] = [];
    const clientEvents: unknown[] = [];
    api.Task.on("change", event => events.push(event));
    api.on("change", event => clientEvents.push(event));
    await api.Task.query("");
    api.cache.setQuery("App/Item", "", ["t1"]);
    const patched = await api.Task.patch("t1", { status: "done" });
    expect(patched.status).toBe("done");
    expect(patched.title).toBe("one");
    expect(api.cache.getEntity("App/Task", "t1")?.data).toMatchObject({ title: "one", status: "done" });
    expect(api.cache.getQuery("App/Task", "")).toBeUndefined();
    expect(api.cache.getQuery("App/Item", "")).toBeUndefined();
    expect(events).toContainEqual({ model: "App/Task", type: "invalidate" });
    expect(events).toContainEqual({ model: "App/Task", uid: "t1", type: "set" });
    expect(clientEvents).toContainEqual({ model: "App/Item", type: "invalidate" });
    expect(server.requests.at(-1)).toMatchObject({ method: "PATCH", body: { status: "done" } });
    // A service operation tagged with a model invalidates it too
    api.cache.setQuery("App/User", "", []);
    await api.call("Auth.Me");
    expect(api.cache.getQuery("App/User", "")).toBeUndefined();
  });

  it("creates, updates, saves, refreshes and deletes", async () => {
    const { server, tasks } = taskServer();
    const api = setup(server, { ttl: 60_000 });
    const created = await api.Task.create({ title: "three" });
    expect(created.uuid).toBe("new");
    expect(api.cache.getEntity("App/Task", "new")?.data.title).toBe("three");
    created.title = "three!";
    await created.save();
    expect(tasks.new.title).toBe("three!");
    await created.patch({ status: "open" });
    expect(created.status).toBe("open");
    tasks.new.title = "server";
    await created.refresh();
    expect(created.title).toBe("server");
    const updated = await api.Task.update("t2", { title: "TWO" });
    expect(updated.title).toBe("TWO");
    expect(server.requests.at(-1)).toMatchObject({
      method: "PUT",
      url: "https://api.test/tasks/t2",
      body: { title: "TWO" }
    });
    await created.delete();
    expect(tasks.new).toBeUndefined();
    expect(api.cache.getEntity("App/Task", "new")).toBeUndefined();
    const ref = api.Task.ref("t1");
    expect(ref.uid).toBe("t1");
    expect((await ref.get()).title).toBe("one");
    expect((await ref.patch({ title: "ONE" })).title).toBe("ONE");
    await ref.delete();
    expect(tasks.t1).toBeUndefined();
    await expect(api.Task.get("t1", { cache: "reload" })).rejects.toMatchObject({ status: 404 });
  });

  it("calls custom actions and refreshes the entity from the output", async () => {
    const { server } = taskServer();
    const api = setup(server, { ttl: 60_000 });
    const result = await api.Task.action<any>("archive", "t1", { reason: "old" });
    expect(result.status).toBe("archived");
    expect(api.cache.getEntity("App/Task", "t1")?.data.status).toBe("archived");
    expect(server.requests.at(-1)).toMatchObject({
      method: "PUT",
      url: "https://api.test/tasks/t1/archive",
      body: { reason: "old" }
    });
    expect(await api.Task.action("count", undefined)).toEqual({ count: 2 });
    await expect(api.Task.action("nope", "t1")).rejects.toThrow(/no action nope/);
    await expect(api.Task.behavior("avatar", "get", "t1")).rejects.toThrow(/no behavior action avatar.get/);
    await expect(api.User.create({})).rejects.toThrow(/no create operation/);
  });

  it("resolves the parents of a nested model from the data or the cache", async () => {
    const { server } = taskServer();
    const api = setup(server);
    await expect(api.Comment.get("c1")).rejects.toThrow(/path parameter 'pid.0'/);
    const comment = await api.Comment.get("c1", { parents: ["t1"] });
    expect(comment.task).toBeInstanceOf(Link);
    expect(comment.getParents()).toEqual(["t1"]);
    // Cached: the parent is known
    expect(await api.Comment.get("c1")).toBeInstanceOf(Comment);
    expect(server.requests.at(-1)!.url).toBe("https://api.test/tasks/t1/comments/c1");
    const created = await api.Comment.create({ task: "t2", text: "new" });
    expect(server.requests.at(-1)!.url).toBe("https://api.test/tasks/t2/comments");
    expect(created.uuid).toBe("c9");
    expect(api.resolveParents("App/Comment", "c9")).toEqual(["t2"]);
    expect(api.resolveParents("App/Comment", "unknown")).toBeUndefined();
    expect(api.resolveParents("App/Task", "t1")).toEqual([]);
  });

  it("handles composite primary keys", async () => {
    const { server } = taskServer();
    const api = setup(server);
    const tag = await api.Tag.get({ org: "acme", slug: "news" });
    expect(tag.getUUID()).toBe("acme/news");
    expect(tag.getPrimaryKey()).toEqual({ org: "acme", slug: "news" });
    expect(api.cache.getEntity("App/Tag", "acme/news")).toBeDefined();
    expect((await api.Tag.get("acme/news")).slug).toBe("news");
    expect(server.requests.at(-1)!.url).toBe("https://api.test/tags/acme/news");
  });
});
