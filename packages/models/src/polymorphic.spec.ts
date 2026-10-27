import { track } from "@webda/utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelTypeResolver } from "./types-resolver.js";
import { Model, UuidModel } from "./model.model.js";
import { WEBDA_PRIMARY_KEY } from "./storable.js";
import { ModelAnyRef, ModelLinksAny, modelLinkIdentity, sameModelLink, setModelLinkLoader } from "./polymorphic.js";

class Task extends UuidModel {}
class Report extends UuidModel {}
class Composite extends Model {
  [WEBDA_PRIMARY_KEY] = ["tenant", "id"] as const;
  tenant = "acme";
  id = 42;
}
for (const clazz of [Task, Report, Composite]) {
  (clazz as any).Metadata = {
    Identifier: `Test/${clazz.name}`,
    PrimaryKey: clazz === Composite ? ["tenant", "id"] : ["uuid"],
    Subclasses: []
  };
}

describe("polymorphic model links", () => {
  let restore: ReturnType<typeof setModelLinkLoader>;
  afterEach(() => {
    setModelLinkLoader(restore);
    vi.restoreAllMocks();
  });

  it("round trips opaque references with custom data and scalar/composite keys", () => {
    const task = new Task();
    task.uuid = "one";
    const links = new ModelLinksAny<{ rel: string }>();
    links.add(task, { rel: "implements" });
    links.add(new Composite(), { rel: "evidence" });
    links.push({ model: "Test/Report", key: 0, rel: "previous" });
    const data = JSON.parse(JSON.stringify(links));
    expect(data).toEqual([
      { model: "Test/Task", key: "one", rel: "implements" },
      { model: "Test/Composite", key: { tenant: "acme", id: 42 }, rel: "evidence" },
      { model: "Test/Report", key: 0, rel: "previous" }
    ]);
    const loaded = new ModelLinksAny<{ rel: string }>();
    loaded.set(data);
    expect(loaded[0]).toBeInstanceOf(ModelAnyRef);
    expect(loaded.at(-1)?.key).toBe(0);
    expect([...loaded].map(ref => ref.rel)).toEqual(["implements", "evidence", "previous"]);
    loaded[0] = { model: "Test/Task", key: "two", rel: "replaces" } as any;
    expect(loaded[0].key).toBe("two");
    expect(links[0].key).toBe("one");
    expect(() => {
      loaded[7] = data[0];
    }).toThrow(/empty slots/);
  });

  it("resolves on EVERY read without caching an instance or a previous caller", async () => {
    let caller = "alice";
    let calls = 0;
    restore = setModelLinkLoader(async ref => {
      calls++;
      if (caller !== "alice") throw new Error("Object not found");
      expect(ref).toEqual({ model: "Test/Task", key: "one" });
      return new Task();
    });
    const task = new Task();
    task.uuid = "one";
    const ref = new ModelLinksAny().add(task);
    expect(await ref.get()).toBeInstanceOf(Task);
    caller = "bob";
    await expect(ref.get()).rejects.toThrow("Object not found");
    expect(calls).toBe(2);
    setModelLinkLoader(undefined);
    await expect(ref.get()).rejects.toThrow(/permission-aware/);
  });

  it("enforces exact target constraints and replaces collections atomically", () => {
    const links = new ModelLinksAny<{ rel: string }, Task>([Task]);
    links.add({ model: "Test/Task", key: "one", rel: "a" });
    expect(() => links.add({ model: "Test/Report", key: "one", rel: "b" })).toThrow(/not an allowed/);
    expect(() =>
      links.set([
        { model: "Test/Task", key: "two", rel: "b" },
        { model: "Test/Report", key: "three", rel: "c" }
      ])
    ).toThrow();
    expect(links.length).toBe(1);
    expect(links[0].key).toBe("one");
  });

  it("works through the framework's deep dirty proxy, including constrained composite references", async () => {
    const model = track({ links: new ModelLinksAny<{ rel: string }, Task>([Task]) });
    model.links.add({ model: "Test/Task", key: { tenant: "acme", id: 42 }, rel: "implements" });
    expect(model.links[0].key).toEqual({ tenant: "acme", id: 42 });
    expect(model.links.toJSON()).toEqual([{ model: "Test/Task", key: { tenant: "acme", id: 42 }, rel: "implements" }]);
    expect(model.dirty.valueOf()).toBe(true);
    expect(() => model.links.add({ model: "Test/Report", key: "bad", rel: "bad" })).toThrow(/not an allowed/);
    model.links[0].rel = "changed";
    expect(model.links[0].rel).toBe("changed");
  });

  it("compares the full identity within one reference", () => {
    const links = new ModelLinksAny();
    links.set([
      { model: "Test/Task", key: "same" },
      { model: "Test/Report", key: "same" }
    ]);
    expect(links.remove({ model: "Test/Task", key: "same" })).toBe(true);
    expect(links.toJSON()).toEqual([{ model: "Test/Report", key: "same" }]);
    expect(
      sameModelLink({ model: "Test/Task", key: { a: 1, b: 2 } }, { model: "Test/Task", key: { b: 2, a: 1 } })
    ).toBe(true);
    expect(sameModelLink({ model: "Test/Task", key: { a: 1 } }, { model: "Test/Task", key: { a: 1, b: 2 } })).toBe(
      false
    );
  });

  it("supports collection transforms and removing absent or last references", () => {
    const links = new ModelLinksAny<{ rel: string }>();
    links.push({ model: "Test/Task", key: "one", rel: "a" }, { model: "Test/Report", key: "two", rel: "b" });
    expect(links.map(ref => ref.rel)).toEqual(["a", "b"]);
    expect(links.filter(ref => ref.model === "Test/Task")).toEqual([links[0]]);
    expect(links.remove({ model: "Test/Task", key: "absent" })).toBe(false);
    expect(links.pop()?.key).toBe("two");
    links.set();
    expect(links.pop()).toBeUndefined();
    const model = "Test/Task";
    for (const [left, right] of [
      [0, 1],
      [1, 0],
      ["a", "b"],
      [{ id: 1 }, 1],
      [null, 1],
      [1, null]
    ]) {
      expect(sameModelLink({ model, key: left } as any, { model, key: right } as any)).toBe(false);
    }
  });

  it("uses only a class's own metadata when a resolver has not indexed its identifier yet", () => {
    vi.spyOn(ModelTypeResolver.prototype, "getIdentifier").mockReturnValue(undefined);
    const task = new Task();
    task.uuid = "one";
    expect(modelLinkIdentity(task)).toEqual({ model: "Test/Task", key: "one" });
    expect(new ModelLinksAny([Task]).add({ model: "Test/Task", key: "one" }).key).toBe("one");
    class Unregistered extends Task {}
    const unknown = new Unregistered();
    unknown.uuid = "one";
    expect(() => modelLinkIdentity(unknown)).toThrow(/namespaced/);
    expect(() => new ModelLinksAny([Unregistered]).add({ model: "Test/Task", key: "one" })).toThrow(/not an allowed/);
    Object.defineProperty(Unregistered, "Metadata", { value: undefined });
    expect(() => modelLinkIdentity(unknown)).toThrow(/namespaced/);
    expect(() => new ModelLinksAny([Unregistered]).add({ model: "Test/Task", key: "one" })).toThrow(/not an allowed/);
  });

  it("rejects malformed identities and metadata that could shadow reference methods", () => {
    for (const key of [null, undefined, "", NaN, Infinity, [], {}, { a: null }, { a: [] }]) {
      expect(() => modelLinkIdentity({ model: "Test/Task", key } as any)).toThrow();
    }
    expect(() => new ModelAnyRef({ model: "Task", key: "one" })).toThrow(/namespaced/);
    for (const property of ["get", "toJSON", "constructor", "target", "__proto__"]) {
      expect(() => new ModelAnyRef(JSON.parse(`{"model":"Test/Task","key":"one","${property}":"bad"}`))).toThrow(
        /Reserved/
      );
    }
  });
});
