import { MemoryStorage } from "@webda/offline/client";
import { describe, expect, it } from "vitest";
import { WebdaClient } from "../client.js";
import { SdkError } from "../errors.js";
import { offline, SyncTransportAdapter } from "./index.js";

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
});
