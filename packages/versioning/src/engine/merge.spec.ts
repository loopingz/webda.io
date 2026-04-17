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
