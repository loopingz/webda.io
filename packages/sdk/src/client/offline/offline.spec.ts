import { MemoryStorage } from "@webda/offline/client";
import { describe, expect, it } from "vitest";
import { WebdaClient } from "../client.js";
import { SdkError } from "../errors.js";
import type { ModelDescriptor, OperationDescriptor, Transport } from "../types.js";
import { offline, splitQuery, SyncTransportAdapter } from "./index.js";

/**
 * @param id - model id
 * @param extra - descriptor overrides
 * @returns a model descriptor
 */
function model(id: string, extra: Partial<ModelDescriptor> = {}): ModelDescriptor {
  return {
    id,
    shortName: id.split("/")[1],
    plural: `${id.split("/")[1]}s`,
    primaryKey: ["uuid"],
    ancestors: [],
    links: [],
    queries: [],
    dates: [],
    operations: { get: `${id}.Get`, actions: {}, behaviors: {} },
    ...extra
  };
}

/**
 * A client with a replica in memory (sync loop stopped) and a transport answering the remote reads
 * @returns the client, its offline extension and the operations the transport received
 */
function offlineClient() {
  const calls: Array<[string, unknown]> = [];
  const transport: Transport = {
    name: "fake",
    supports: () => true,
    call: async (op: OperationDescriptor, input: unknown) => {
      calls.push([op.id, input]);
      return { ...(input as object), remote: true };
    }
  };
  const models = {
    "Test/Note": model("Test/Note", { ancestors: ["Test/Item"] }),
    "Test/Item": model("Test/Item")
  };
  const operations = Object.fromEntries(
    ["Test/Note.Get", "Test/Item.Get"].map(id => [id, { id, input: "In", output: "Out", streaming: "none" as const }])
  );
  const extension = offline({ storage: new MemoryStorage(), start: false });
  const client = new WebdaClient({
    operations,
    models,
    transports: [transport],
    server: {
      transports: {},
      offline: { models: ["Test/Note"], operations: { pull: "P", push: "U", snapshot: "S" } }
    },
    offline: extension
  });
  const backend: any = extension.backend(models["Test/Note"]);
  return { client, extension, backend, calls };
}

describe("offline()", () => {
  it("needs a SyncService and one client", async () => {
    const extension = offline({ storage: new MemoryStorage(), start: false });
    await expect(extension.ready()).rejects.toThrow(/not attached/);
    expect(() => new WebdaClient({ operations: {}, offline: extension })).toThrow(SdkError);
    const server = {
      transports: {},
      offline: { models: ["Test/Note", "Test/Unknown"], operations: { pull: "P", push: "U", snapshot: "S" } }
    };
    const models = {
      "Test/Note": {
        id: "Test/Note",
        shortName: "Note",
        plural: "Notes",
        primaryKey: ["uuid"],
        ancestors: [],
        links: [],
        queries: [],
        dates: [],
        operations: { actions: {}, behaviors: {} }
      }
    };
    const client = new WebdaClient({ operations: {}, models, server, offline: extension });
    expect(client.offline).toBe(extension);
    // Only the models the client knows
    expect(extension.models).toEqual(["Test/Note"]);
    expect(extension.backend(models["Test/Note"])).toBeDefined();
    expect(extension.backend({ ...models["Test/Note"], id: "Test/Other" })).toBeUndefined();
    expect(() => new WebdaClient({ operations: {}, models, server, offline: extension })).toThrow(/already attached/);
    expect(extension.status).toBe("idle");
    expect((await extension.ready()).options.primaryKeys).toEqual({ "Test/Note": ["uuid"] });
    expect(extension.replica).toBeDefined();
    extension.stop();
  });

  it("adapts the Sync operations, without watch when the application has none", async () => {
    const calls: any[] = [];
    const client: any = {
      call: async (id: string, input: unknown) => {
        calls.push([id, input]);
        return { id };
      },
      stream: (id: string) => {
        calls.push([id]);
        return (async function* chunks() {})();
      }
    };
    const adapter = new SyncTransportAdapter(client, { pull: "P", push: "U", snapshot: "S" });
    expect(adapter.watch).toBeUndefined();
    expect(await adapter.pull({ scopes: [] })).toEqual({ id: "P" });
    expect(await adapter.push({ mutations: [] })).toEqual({ id: "U" });
    expect(await adapter.snapshot({ scope: { model: "M" } })).toEqual({ id: "S" });
    const watching = new SyncTransportAdapter(client, { pull: "P", push: "U", snapshot: "S", watch: "W" });
    for await (const hint of watching.watch!({ scopes: [] }, new AbortController().signal)) void hint;
    expect(calls.map(call => call[0])).toEqual(["P", "U", "S", "W"]);
  });

  it("reads and writes the replica, mapping its refusals to SdkError", async () => {
    const { extension, backend, calls } = offlineClient();
    const created = await backend.create({ uuid: "n1", title: "first" });
    expect(created).toEqual({ uuid: "n1", title: "first" });
    expect(await backend.get("n1", {})).toEqual({ uuid: "n1", title: "first" });
    // update() merges like patch()
    expect(await backend.update("n1", { done: true })).toEqual({ uuid: "n1", title: "first", done: true });
    expect(await backend.patch("n1", { title: "renamed" })).toEqual({ uuid: "n1", title: "renamed", done: true });
    // Refusals of the replica
    await expect(backend.create({ uuid: "n1" })).rejects.toMatchObject({ status: 409, transport: "offline" });
    await expect(backend.patch("missing", { title: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(backend.local(() => Promise.reject(new Error("Invalid key")))).rejects.toMatchObject({ status: 400 });
    // Something else than an Error
    await expect(backend.local(() => Promise.reject("refused"))).rejects.toMatchObject({
      status: 400,
      message: "refused"
    });
    await expect(backend.local(() => Promise.reject(undefined))).rejects.toMatchObject({ message: "undefined" });
    // An object the replica does not hold is read through the transports
    expect(await backend.get("elsewhere", {})).toEqual({ uuid: "elsewhere", remote: true });
    expect(calls).toEqual([["Test/Note.Get", { uuid: "elsewhere" }]]);
    await backend.delete("n1");
    expect(await backend.get("n1", {})).toEqual({ uuid: "n1", remote: true });
    // Settling a conflict that is not open is refused by the replica
    await expect(extension.resolve({ model: "Test/Note", key: "n1" }, new Map())).rejects.toThrow(/No open conflict/);
  });

  it("orders, limits and pages the local query results", async () => {
    const { backend } = offlineClient();
    const notes = [
      { uuid: "a", group: "g1", rank: 1, meta: { pos: 2 } },
      { uuid: "b", group: "g1", rank: 2, meta: { pos: 1 } },
      { uuid: "c", group: "g1", rank: 2, meta: { pos: 3 } },
      { uuid: "d", group: "g1", rank: 1, meta: { pos: 2 } },
      { uuid: "e", group: "g2", rank: 3 },
      { uuid: "f", group: "g2", rank: null },
      { uuid: "g", group: "g2", rank: 1, meta: null },
      { uuid: "h", group: "g3", title: "x" },
      { uuid: "i", group: "g3", title: "y", rank: 4 },
      { uuid: "j", group: "g4", meta: { pos: 1 } },
      { uuid: "k", group: "g4", meta: null },
      { uuid: "l", group: "g4" }
    ];
    for (const note of notes) await backend.create(note);
    const uuids = async (query: string) => (await backend.query(query)).results.map((note: any) => note.uuid);
    // Ties fall to the next field; equal on every field keeps the order of the replica
    expect(await uuids(`group = 'g1' ORDER BY rank DESC, meta.pos`)).toEqual(["b", "c", "a", "d"]);
    expect(await uuids(`group = 'g1' ORDER BY rank, meta.pos DESC`)).toEqual(["a", "d", "c", "b"]);
    // null / undefined sort first
    expect(await uuids(`group = 'g2' ORDER BY rank`)).toEqual(["f", "g", "e"]);
    expect(await uuids(`group = 'g2' ORDER BY rank DESC`)).toEqual(["e", "g", "f"]);
    // A null or missing parent is a missing value; null and undefined are equal
    expect(await uuids(`group = 'g4' ORDER BY meta.pos`)).toEqual(["k", "l", "j"]);
    expect(await uuids(`group = 'g4' ORDER BY meta.pos DESC`)).toEqual(["j", "k", "l"]);
    expect(await uuids(`group = 'g3' ORDER BY rank`)).toEqual(["h", "i"]);
    expect(await uuids(`group = 'g3' ORDER BY rank DESC`)).toEqual(["i", "h"]);
    // LIMIT / OFFSET page the results, the continuation token is the next offset
    expect(await backend.query(`group = 'g1' ORDER BY uuid LIMIT 3`)).toMatchObject({ continuationToken: "3" });
    const last = await backend.query(`group = 'g1' ORDER BY uuid LIMIT 3 OFFSET "3"`);
    expect(last.results.map((note: any) => note.uuid)).toEqual(["d"]);
    expect(last.continuationToken).toBeUndefined();
    // count adds the local total of the filter, whatever the page
    expect((await backend.query(`group = 'g1' ORDER BY uuid LIMIT 3`)).total).toBeUndefined();
    expect((await backend.query(`group = 'g1' ORDER BY uuid LIMIT 3`, { count: true })).total).toEqual({
      value: 4,
      relation: "eq"
    });
    expect((await backend.query(`group = 'g1' LIMIT 3 OFFSET "3"`, { count: true })).total).toEqual({
      value: 4,
      relation: "eq"
    });
    // An unusable offset starts over
    expect(await uuids(`group = 'g1' ORDER BY uuid LIMIT 1 OFFSET 'next'`)).toEqual(["a"]);
    // No clause: every result, unordered pages are copies
    const all = await backend.query(`group = 'g3'`);
    expect(all.results).toHaveLength(2);
    expect(all.continuationToken).toBeUndefined();
    all.results[0].title = "changed";
    expect((await backend.query(`group = 'g3'`)).results.map((note: any) => note.title)).not.toContain("changed");
  });

  it("follows the replica changes in the cache", async () => {
    const { client, extension } = offlineClient();
    const events: any[] = [];
    client.on("change", event => events.push(event));
    const changes: any[] = [];
    extension.on("change", event => changes.push(event));
    const replica = await extension.ready();
    await replica.collection("Test/Note").create({ uuid: "n1", title: "local" });
    expect(client.cache.getEntity("Test/Note", "n1")?.data).toEqual({ uuid: "n1", title: "local" });
    // The lists of the ancestors are invalidated
    expect(events).toEqual([
      { model: "Test/Note", uid: "n1", type: "set" },
      { model: "Test/Item", type: "invalidate" }
    ]);
    await replica.collection("Test/Note").delete("n1");
    expect(client.cache.getEntity("Test/Note", "n1")).toBeUndefined();
    // A model the client does not serve offline only emits the change
    events.length = 0;
    (extension as any).onChange({ ref: { model: "Test/Item", key: "i1" }, object: { uuid: "i1" }, origin: "remote" });
    expect(events).toEqual([]);
    expect(changes.map(change => change.ref.key)).toEqual(["n1", "n1", "i1"]);
  });
});

describe("splitQuery", () => {
  it("splits the trailing ORDER BY, LIMIT and OFFSET clauses from the filter", () => {
    expect(splitQuery(`x = 1 ORDER BY a DESC, b LIMIT 5 OFFSET "t"`)).toEqual({
      filter: "x = 1",
      orderBy: [
        { field: "a", direction: "DESC" },
        { field: "b", direction: "ASC" }
      ],
      limit: 5,
      offset: "t"
    });
    // Case-insensitive, dotted fields, single quotes with escapes, extra whitespace
    expect(splitQuery(`  x = 1   order   by  meta.a asc ,b desc   limit 2   offset 'it\\'s'  `)).toEqual({
      filter: "x = 1",
      orderBy: [
        { field: "meta.a", direction: "ASC" },
        { field: "b", direction: "DESC" }
      ],
      limit: 2,
      offset: "it's"
    });
    // Each clause alone, without a filter
    expect(splitQuery(`ORDER BY a`)).toEqual({ filter: "", orderBy: [{ field: "a", direction: "ASC" }] });
    expect(splitQuery(`LIMIT 3`)).toEqual({ filter: "", orderBy: [], limit: 3 });
    expect(splitQuery(`OFFSET "a\\"b"`)).toEqual({ filter: "", orderBy: [], offset: 'a"b' });
    expect(splitQuery("")).toEqual({ filter: "", orderBy: [] });
    // Not a clause: inside a string, glued to a word, out of order, or without a value
    expect(splitQuery(`title = 'LIMIT 5'`).filter).toBe(`title = 'LIMIT 5'`);
    expect(splitQuery(`fooLIMIT 5`)).toEqual({ filter: "fooLIMIT 5", orderBy: [] });
    expect(splitQuery(`x = 1 LIMIT 5 ORDER BY a`)).toEqual({
      filter: "x = 1 LIMIT 5",
      orderBy: [{ field: "a", direction: "ASC" }]
    });
    expect(splitQuery(`x = 1 OFFSET 5`)).toEqual({ filter: "x = 1 OFFSET 5", orderBy: [] });
    expect(splitQuery(`x = 1 LIMIT`)).toEqual({ filter: "x = 1 LIMIT", orderBy: [] });
  });

  it("stays linear on long whitespace runs", () => {
    const spaces = " ".repeat(50_000);
    const start = performance.now();
    expect(splitQuery(`x = 1${spaces}LIMIT${spaces}x`).limit).toBeUndefined();
    expect(splitQuery(`x${spaces}OFFSET${spaces}"a`).offset).toBeUndefined();
    expect(splitQuery(`x${spaces}ORDER BY a${spaces},${spaces}b${spaces}!`).orderBy).toEqual([]);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
