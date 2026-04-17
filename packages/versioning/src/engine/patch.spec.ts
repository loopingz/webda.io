import { describe, it, expect } from "vitest";
import { diff } from "./diff.js";
import { patch } from "./patch.js";
import { lineDiff } from "../strings/line-diff.js";
import { VersioningError } from "../errors.js";
import type { Delta } from "../types.js";

describe("patch", () => {
  it("applies a structural delta", () => {
    const a = { a: 1, b: 2 };
    const b = { a: 1, b: 3 };
    const result = patch(a, diff(a, b));
    expect(result).toEqual(b);
  });

  it("applies line-strategy hunks", () => {
    const a = { body: "line one\nline two\n" };
    const b = { body: "line one\nline two MODIFIED\n" };
    const result = patch(a, diff(a, b));
    expect(result).toEqual(b);
  });

  it("is a no-op when delta is empty", () => {
    const a = { a: 1 };
    const result = patch(a, diff(a, a));
    expect(result).toEqual(a);
  });

  it("applies nested changes", () => {
    const a = { nested: { x: { y: 1 } } };
    const b = { nested: { x: { y: 2 } } };
    expect(patch(a, diff(a, b))).toEqual(b);
  });

  it("throws BAD_FORMAT for unsupported delta version", () => {
    const bad = { __versioning: 2 } as unknown as Delta;
    expect(() => patch({ a: 1 }, bad)).toThrow(VersioningError);
    expect(() => patch({ a: 1 }, bad)).toThrow(/unsupported delta format/);
  });

  it("throws STRATEGY_MISMATCH when hunk path does not resolve to a string", () => {
    const delta: Delta = {
      __versioning: 1,
      stringHunks: { "/a": lineDiff("x\n", "y\n") }
    };
    expect(() => patch({ a: 42 }, delta)).toThrow(VersioningError);
    expect(() => patch({ a: 42 }, delta)).toThrow(/expected string at \/a/);
  });
});
