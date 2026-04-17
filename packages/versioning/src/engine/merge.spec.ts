import { describe, it, expect } from "vitest";
import { merge3 } from "./merge.js";

describe("merge3 (values/scalars)", () => {
  it("clean merge of disjoint changes", () => {
    const base = { a: 1, b: 1 };
    const ours = { a: 2, b: 1 };
    const theirs = { a: 1, b: 2 };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual({ a: 2, b: 2 });
  });

  it("same change on both sides is not a conflict", () => {
    const base = { a: 1 };
    const ours = { a: 2 };
    const theirs = { a: 2 };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual({ a: 2 });
  });

  it("conflict when both sides set same key to different values", () => {
    const base = { a: 1 };
    const ours = { a: 2 };
    const theirs = { a: 3 };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(false);
    expect(r.conflicts).toHaveLength(1);
    const c = r.conflicts[0];
    expect(c.path).toBe("/a");
    expect(c.kind).toBe("value");
    expect(c.base).toBe(1);
    expect(c.ours).toBe(2);
    expect(c.theirs).toBe(3);
  });

  it("delete-modify conflict: ours deletes, theirs modifies", () => {
    const base = { a: 1 };
    const ours = {};
    const theirs = { a: 2 };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(false);
    expect(r.conflicts[0].kind).toBe("delete-modify");
  });

  it("delete-modify conflict: theirs deletes, ours modifies", () => {
    const base = { a: 1 };
    const ours = { a: 2 };
    const theirs = {};
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(false);
    expect(r.conflicts[0].kind).toBe("delete-modify");
  });

  it("identity: merge3(x, x, x) is clean and equal to x", () => {
    const x = { a: 1, b: { c: "hi" } };
    const r = merge3(x, x, x);
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual(x);
    expect(r.conflicts).toEqual([]);
  });

  it("nested clean merge", () => {
    const base = { x: { a: 1, b: 1 } };
    const ours = { x: { a: 2, b: 1 } };
    const theirs = { x: { a: 1, b: 2 } };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual({ x: { a: 2, b: 2 } });
  });

  it("only one side changed takes that side", () => {
    const base = { a: 1, b: 1 };
    const ours = { a: 2, b: 1 };
    const theirs = { a: 1, b: 1 };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual({ a: 2, b: 1 });
  });

  it("NaN values compare equal (no spurious conflict)", () => {
    const r = merge3({ v: NaN }, { v: NaN }, { v: NaN });
    expect(r.clean).toBe(true);
    expect(Number.isNaN((r.merged as { v: number }).v)).toBe(true);
  });
});

describe("merge3 (arrays)", () => {
  const cfg = { arrayId: { "/items": "id" } };

  it("inserts from both sides when arrayId is configured", () => {
    const base = { items: [{ id: "1", v: 1 }] };
    const ours = { items: [{ id: "1", v: 1 }, { id: "2", v: 2 }] };
    const theirs = { items: [{ id: "1", v: 1 }, { id: "3", v: 3 }] };
    const r = merge3(base, ours, theirs, cfg);
    expect(r.clean).toBe(true);
    expect(r.merged.items).toEqual(
      expect.arrayContaining([
        { id: "1", v: 1 },
        { id: "2", v: 2 },
        { id: "3", v: 3 }
      ])
    );
    expect(r.merged.items).toHaveLength(3);
  });

  it("recurses into items modified on both sides (clean)", () => {
    const base = { items: [{ id: "1", a: 1, b: 1 }] };
    const ours = { items: [{ id: "1", a: 2, b: 1 }] };
    const theirs = { items: [{ id: "1", a: 1, b: 2 }] };
    const r = merge3(base, ours, theirs, cfg);
    expect(r.clean).toBe(true);
    expect(r.merged.items[0]).toEqual({ id: "1", a: 2, b: 2 });
  });

  it("raises delete-modify conflict on array items", () => {
    const base = { items: [{ id: "1", v: 1 }] };
    const ours = { items: [] };
    const theirs = { items: [{ id: "1", v: 2 }] };
    const r = merge3(base, ours, theirs, cfg);
    expect(r.clean).toBe(false);
    const c = r.conflicts[0];
    expect(c.kind).toBe("delete-modify");
    expect(c.path).toBe("/items/1");
  });

  it("JSON-pointer-escapes ids containing '/' or '~'", () => {
    const base = { items: [{ id: "us/east", v: 1 }] };
    const ours = { items: [] };
    const theirs = { items: [{ id: "us/east", v: 2 }] };
    const r = merge3(base, ours, theirs, cfg);
    expect(r.clean).toBe(false);
    // '/' must be escaped as ~1 in a JSON Pointer segment.
    expect(r.conflicts[0].path).toBe("/items/us~1east");
  });

  it("without arrayId, any array change falls back to whole-array conflict", () => {
    const base = { items: [1, 2, 3] };
    const ours = { items: [1, 2, 4] };
    const theirs = { items: [0, 2, 3] };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(false);
    const c = r.conflicts[0];
    expect(c.path).toBe("/items");
    expect(c.kind).toBe("value");
  });

  it("without arrayId and only one side changed, takes that side", () => {
    const base = { items: [1, 2, 3] };
    const ours = { items: [1, 2, 4] };
    const theirs = { items: [1, 2, 3] };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual(ours);
  });
});

describe("merge3 (line-strategy strings)", () => {
  it("clean line merge when edits don't overlap", () => {
    const base = { body: "line 1\nline 2\nline 3\n" };
    const ours = { body: "line 1 OURS\nline 2\nline 3\n" };
    const theirs = { body: "line 1\nline 2\nline 3 THEIRS\n" };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged.body).toBe("line 1 OURS\nline 2\nline 3 THEIRS\n");
  });

  it("line conflict with hunks populated", () => {
    const base = { body: "a\nb\nc\n" };
    const ours = { body: "a\nOURS\nc\n" };
    const theirs = { body: "a\nTHEIRS\nc\n" };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(false);
    const c = r.conflicts.find((c) => c.path === "/body");
    expect(c).toBeDefined();
    expect(c!.kind).toBe("line");
    // Narrow: c has kind "line", so hunks is required.
    if (c!.kind === "line") {
      expect(c!.hunks).toBeDefined();
      expect(c!.hunks.ours).toBeDefined();
      expect(c!.hunks.theirs).toBeDefined();
    }
    // merged default = ours side at conflict
    expect(r.merged.body).toBe(ours.body);
  });

  it("single-line strings still produce value conflicts (not line)", () => {
    const r = merge3({ title: "base" }, { title: "ours" }, { title: "theirs" });
    expect(r.clean).toBe(false);
    expect(r.conflicts[0].kind).toBe("value");
  });

  it("short multiline strings under multilineThreshold use replace strategy", () => {
    const cfg = { multilineThreshold: 100 };
    const base = { body: "a\nb\n" };
    const ours = { body: "x\nb\n" };
    const theirs = { body: "a\ny\n" };
    const r = merge3(base, ours, theirs, cfg);
    // body is 4 chars < 100 → replace → value conflict, not line
    expect(r.conflicts[0].kind).toBe("value");
  });

  it("strategy is symmetric: swapping ours/theirs gives the same strategy", () => {
    // Regression test: probing `base` (not `theirs`) for strategy selection
    // means the decision doesn't flip when callers swap ours/theirs.
    const base = { body: "one\ntwo\nthree\n" };
    const ours = { body: "one\nOURS\nthree\n" };
    const theirs = { body: "one\nTHEIRS\nthree\n" };
    const r1 = merge3(base, ours, theirs);
    const r2 = merge3(base, theirs, ours);
    expect(r1.conflicts[0].kind).toBe("line");
    expect(r2.conflicts[0].kind).toBe("line");
  });
});
