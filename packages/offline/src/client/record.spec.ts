import { describe, expect, it } from "vitest";
import { clone, deepEqual } from "./record.js";

describe("deepEqual", () => {
  it("compares JSON values structurally", () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual([1, 2], [1, 3])).toBe(false);
    expect(deepEqual([1], [1, 2])).toBe(false);
    expect(deepEqual({ a: 1 }, null)).toBe(false);
    expect(deepEqual(1, "1")).toBe(false);
  });

  it("never equates an array with an object", () => {
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual({ 0: "a" }, ["a"])).toBe(false);
  });
});

describe("clone", () => {
  it("deep copies and keeps undefined", () => {
    const value = { a: { b: [1] } };
    const copy = clone(value);
    expect(copy).toEqual(value);
    copy.a.b.push(2);
    expect(value.a.b).toEqual([1]);
    expect(clone(undefined)).toBeUndefined();
    expect(clone(null)).toBeNull();
  });
});
