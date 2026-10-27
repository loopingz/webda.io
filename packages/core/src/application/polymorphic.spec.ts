import { describe, expect, it } from "vitest";
import { MemoryRepository, ModelAnyRef, ModelLinksAny, UuidModel, registerRepository } from "@webda/models";
import { installModelTypes } from "./model-types.js";
import { runWithInstanceStorage } from "../core/instancestorage.js";
import { runWithContext } from "../contexts/execution.js";
import { findModelBacklinks, loadModelLink } from "../models/polymorphic.js";
import { BadRequest, NotFound } from "../errors/errors.js";

class Target extends UuidModel {
  owner: string;
  canAct(context) {
    return this.owner === context.getCurrentUserId();
  }
}
class OtherTarget extends Target {}
class Source extends Target {
  links: any;
}
for (const clazz of [Target, OtherTarget, Source]) {
  (clazz as any).Metadata = {
    Identifier: `Poly/${clazz.name}`,
    PrimaryKey: ["uuid"],
    Subclasses: [],
    Relations: clazz === Source ? { polymorphicLinks: [{ attribute: "links" }] } : {}
  };
  clazz.registerSerializer();
}
const alice: any = { getCurrentUserId: () => "alice" };
const bob: any = { getCurrentUserId: () => "bob" };
const models = { "Poly/Target": Target, "Poly/OtherTarget": OtherTarget, "Poly/Source": Source };
const app: any = { getModels: () => models, getNamespace: () => "Poly" };
const ref = { model: "Poly/Target", key: "t" };

/** Fresh in-memory repositories, used inside a single active application. */
async function seed() {
  for (const clazz of [Target, OtherTarget, Source]) registerRepository(clazz, new MemoryRepository(clazz, ["uuid"]));
  await Target.create({ uuid: "t", owner: "alice" });
  await OtherTarget.create({ uuid: "t", owner: "bob" });
  await Source.create({ uuid: "yes", owner: "alice", links: [{ ...ref, rel: "implements" }] });
  await Source.create({ uuid: "hidden", owner: "bob", links: [ref] });
  // Neither element has BOTH the requested model and key.
  await Source.create({
    uuid: "crossed",
    owner: "alice",
    links: [
      { model: "Poly/Target", key: "other" },
      { model: "Poly/OtherTarget", key: "t" }
    ]
  });
}

async function collect(target = ref, options: any = {}) {
  const found = [];
  for await (const entry of findModelBacklinks(target, options)) found.push(entry);
  return found;
}

describe("permission-aware polymorphic links", () => {
  it("installs a loader that resolves the active caller and application on every read", async () => {
    await runWithInstanceStorage({ application: app }, async () => {
      installModelTypes(app);
      await seed();
      const reference = new ModelAnyRef(ref);
      const readable = await runWithContext(alice, () => reference.get());
      expect(readable.getPrimaryKey()).toBe("t");
      await expect(runWithContext(bob, () => reference.get())).rejects.toThrow(NotFound);
      await expect(loadModelLink({ model: "Unknown/Target", key: "t" }, alice)).rejects.toThrow("Object not found");
      await expect(loadModelLink({ ...ref, key: "missing" }, alice)).rejects.toThrow("Object not found");
      await expect(loadModelLink({ model: "Target", key: "t" }, alice)).rejects.toThrow(BadRequest);
      const otherApp: any = { getModels: () => ({ "Poly/Target": OtherTarget }) };
      await runWithInstanceStorage({ application: otherApp }, async () => {
        await expect(runWithContext(alice, () => reference.get())).rejects.toThrow("Object not found");
        expect(await runWithContext(bob, () => reference.get())).toBeInstanceOf(OtherTarget);
      });
      expect(await runWithContext(alice, () => reference.get())).toBeInstanceOf(Target);
    });
  });

  it("returns only readable backlinks with same-element identity matches", async () => {
    await runWithInstanceStorage({ application: app }, async () => {
      await seed();
      const found = await collect(ref, { context: alice });
      expect(found.map(entry => [entry.model, entry.key, entry.attribute, entry.references])).toEqual([
        ["Poly/Source", "yes", "links", [{ ...ref, rel: "implements" }]]
      ]);
      expect(await collect(ref, { context: alice, models: ["Poly/Target"] })).toEqual([]);
      await expect(collect(ref, { context: bob })).rejects.toThrow("Object not found");
      await expect(collect(ref, { context: alice, models: ["No/Model"] })).rejects.toThrow(BadRequest);
      await expect(collect(ref, { context: alice, scanLimit: 0 })).rejects.toThrow(BadRequest);
      await expect(collect(ref, { context: alice, scanLimit: 1, limit: 10 })).rejects.toThrow(/scan limit exceeded/);
    });
  });

  it("paginates sources, supports link containers, and never removes dangling references", async () => {
    const values = new ModelLinksAny();
    values.set([ref]);
    const queried: string[] = [];
    const paged: any = class extends Source {};
    paged.Metadata = Source["Metadata"];
    const visible = Object.assign(new paged(), { uuid: "last", owner: "alice", links: values });
    paged.query = async query => {
      queried.push(query);
      return queried.length === 1 ? { results: [], continuationToken: "second'page" } : { results: [visible] };
    };
    await runWithInstanceStorage(
      { application: { ...app, getModels: () => ({ "Poly/Target": Target, "Poly/Source": paged }) } as any },
      async () => {
        await seed();
        expect((await collect(ref, { context: alice }))[0].key).toBe("last");
        expect(queried).toHaveLength(2);
        expect(queried[1]).toContain("OFFSET");
        let calls = 0;
        paged.query = async () => ({ results: [], continuationToken: `next-${++calls}` });
        await expect(collect(ref, { context: alice, scanLimit: 2 })).rejects.toThrow(/page limit exceeded/);
        expect(calls).toBe(2);
        paged.query = async () => ({ results: [], continuationToken: "stuck" });
        await expect(collect(ref, { context: alice })).rejects.toThrow(/pagination did not progress/);
        values.add({ model: "Poly/Target", key: "deleted" });
        await expect(loadModelLink(values[1], alice)).rejects.toThrow("Object not found");
        expect(values.length).toBe(2);
      }
    );
  });
});
