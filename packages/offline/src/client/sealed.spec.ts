import { describe, expect, it } from "vitest";
import { OfflineClient, type ChangeEvent } from "./client.js";
import { isSealed, sealedFields, type SealedContext, type SealedOpener, type SealedValue } from "./sealed.js";
import { MemoryStorage } from "./storage/memory.js";
import type { Transport } from "./transport/transport.js";

interface Note {
  uuid: string;
  title: string;
  content?: SealedValue | { body: string } | null;
}

const offline: Transport = {
  pull: async () => {
    throw new Error("offline");
  },
  push: async () => {
    throw new Error("offline");
  },
  snapshot: async () => {
    throw new Error("offline");
  }
};

/**
 * @param body - the plaintext
 * @returns a well-formed envelope "sealing" it: the fake vault reads the plaintext back from `ct`
 */
function envelope(body: string): SealedValue {
  return { v: 1, kid: "k1", epk: { kty: "EC" }, iv: "iv", ct: JSON.stringify({ body }) };
}

/** A vault opening the fake envelopes, recording the contexts it was given */
class FakeVault implements SealedOpener {
  isUnlocked = true;
  contexts: SealedContext[] = [];
  async open<T>(env: SealedValue, ctx: SealedContext): Promise<T> {
    this.contexts.push(ctx);
    if (env.kid !== "k1") throw new Error(`No private key for ${env.kid}`);
    return JSON.parse(env.ct);
  }
}

/**
 * @param options - client options overrides
 * @returns a client with decrypt-on-read of `App/Note.content`
 */
function setup(options: Partial<ConstructorParameters<typeof OfflineClient>[0]> = {}) {
  const storage = new MemoryStorage();
  const vault = new FakeVault();
  const client = new OfflineClient({
    storage,
    transport: offline,
    scopes: [{ model: "App/Note" }, { model: "App/Task" }],
    syncInterval: 0,
    sealed: { fields: { "App/Note": ["content"] }, vault },
    ...options
  });
  return { storage, vault, client, notes: client.collection<Note>("App/Note") };
}

describe("Sealed fields", () => {
  it("opens the sealed fields on read, in memory only", async () => {
    const { notes, storage, vault, client } = setup();
    const events: ChangeEvent[] = [];
    client.on("change", evt => events.push(evt));
    await storage.putRecords([
      {
        id: "App/Note|n1",
        ref: { model: "App/Note", key: "n1" },
        base: { uuid: "n1", title: "a", content: envelope("secret") },
        baseRev: 1,
        current: { uuid: "n1", title: "a", content: envelope("secret") },
        state: "synced"
      }
    ]);
    expect(await notes.get("n1")).toEqual({ uuid: "n1", title: "a", content: { body: "secret" } });
    expect(vault.contexts).toEqual([{ modelType: "App/Note", uuid: "n1", field: "content" }]);
    // The storage still holds the envelope
    expect((await storage.getRecord("App/Note|n1"))?.current.content).toEqual(envelope("secret"));
    expect(await notes.query("title = 'a'")).toEqual([{ uuid: "n1", title: "a", content: { body: "secret" } }]);
    // The filter is evaluated on the stored envelope: a sealed field never matches
    expect(await notes.query("content.body = 'secret'")).toEqual([]);
    // A write stores the envelope and notifies it; a missing or cleared field is fine
    const written = await notes.patch("n1", { content: envelope("other") });
    expect(written.content).toEqual(envelope("other"));
    expect(events.at(-1)?.object.content).toEqual(envelope("other"));
    expect(await notes.get("n1")).toEqual({ uuid: "n1", title: "a", content: { body: "other" } });
    await notes.patch("n1", { title: "b" });
    await notes.patch("n1", { content: null });
    expect((await notes.get("n1"))?.content).toBeNull();
    const created = await notes.create({ title: "c", content: envelope("new") });
    expect((await notes.get(created.uuid))?.content).toEqual({ body: "new" });
  });

  it("keeps the envelope while the vault is locked, or when the value does not open", async () => {
    const { notes, vault, client } = setup();
    const errors: unknown[] = [];
    client.on("error", err => errors.push(err));
    const note = await notes.create({ title: "a", content: envelope("secret") });
    vault.isUnlocked = false;
    const locked = await notes.get(note.uuid);
    expect(isSealed(locked?.content)).toBe(true);
    expect(locked?.content).toEqual(envelope("secret"));
    expect(vault.contexts).toEqual([]);
    expect((await notes.query())[0].content).toEqual(envelope("secret"));
    vault.isUnlocked = true;
    expect(isSealed((await notes.get(note.uuid))?.content)).toBe(false);
    // A key this vault does not hold: the envelope stays, the error is reported
    const stale = { ...envelope("old"), kid: "k0" };
    await notes.patch(note.uuid, { content: stale });
    expect((await notes.get(note.uuid))?.content).toEqual(stale);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain("No private key for k0");
    // Not an envelope (a partial or foreign object) is returned as stored
    expect(isSealed(null)).toBe(false);
    expect(isSealed({ v: 1, kid: "k1" })).toBe(false);
    expect(isSealed({ v: 2, kid: "k1", epk: {}, iv: "iv", ct: "ct" })).toBe(false);
  });

  it("refuses a plaintext written to a sealed field", async () => {
    const { notes, storage } = setup();
    await expect(notes.create({ title: "a", content: { body: "plain" } })).rejects.toThrow(
      /App\/Note.content is sealed: store the envelope/
    );
    expect(await storage.scan("App/Note")).toEqual([]);
    const note = await notes.create({ title: "a" });
    await expect(notes.patch(note.uuid, { content: { body: "plain" } })).rejects.toThrow(/is sealed/);
    expect((await notes.get(note.uuid))?.content).toBeUndefined();
  });

  it("binds the value to the record key: composite keys joined with _, or a custom uuid", async () => {
    const composite = setup({
      primaryKeys: { "App/Note": ["a", "b"] },
      sealed: { fields: { "App/Note": ["content"] }, vault: new FakeVault() }
    });
    const vault = composite.client.options.sealed!.vault as FakeVault;
    const notes = composite.client.collection<any>("App/Note");
    await notes.create({ a: "x", b: 2, title: "t", content: envelope("v") });
    expect((await notes.get({ a: "x", b: 2 })).content).toEqual({ body: "v" });
    expect(vault.contexts[0].uuid).toBe("x_2");
    const custom = setup({
      sealed: {
        fields: { "App/Note": ["content"] },
        vault: new FakeVault(),
        uuidOf: (model, pkFields, object) => `${model}:${pkFields.join(",")}:${object.uuid}`
      }
    });
    await custom.notes.create({ uuid: "n1", title: "t", content: envelope("v") });
    await custom.notes.get("n1");
    expect((custom.client.options.sealed!.vault as FakeVault).contexts[0].uuid).toBe("App/Note:uuid:n1");
  });

  it("leaves other models and clients without the option alone", async () => {
    const { client, vault } = setup();
    const tasks = client.collection<any>("App/Task");
    const task = await tasks.create({ title: "t", content: envelope("not sealed here") });
    expect((await tasks.get(task.uuid)).content).toEqual(envelope("not sealed here"));
    expect(vault.contexts).toEqual([]);
    const plain = new OfflineClient({
      storage: new MemoryStorage(),
      transport: offline,
      scopes: [{ model: "App/Note" }],
      syncInterval: 0
    });
    const notes = plain.collection<any>("App/Note");
    const note = await notes.create({ title: "t", content: { body: "plain" } });
    expect((await notes.get(note.uuid)).content).toEqual({ body: "plain" });
    expect(await notes.get("missing")).toBeUndefined();
  });

  it("reads the sealed attributes of a model schema", () => {
    expect(
      sealedFields({
        properties: { uuid: { type: "string" }, content: { type: "object", "x-webda-sealed": true }, other: {} }
      })
    ).toEqual(["content"]);
    expect(sealedFields({})).toEqual([]);
  });
});
