import { describe, it, expect } from "vitest";
import { diff } from "./diff.js";

describe("diff", () => {
  it("returns a branded delta", () => {
    const d = diff({ a: 1 }, { a: 2 });
    expect(d.__versioning).toBe(1);
    expect(d.ops).toBeDefined();
  });

  it("returns undefined-ops delta for equal objects", () => {
    const d = diff({ a: 1 }, { a: 1 });
    expect(d.ops).toBeUndefined();
    expect(d.stringHunks).toBeUndefined();
  });

  it("uses replace strategy for single-line strings (no stringHunks)", () => {
    const d = diff({ title: "old" }, { title: "new" });
    expect(d.stringHunks).toBeUndefined();
    expect(d.ops).toBeDefined();
  });

  it("uses line strategy for multiline strings (produces stringHunks)", () => {
    const a = { body: "line one\nline two\n" };
    const b = { body: "line one\nline two MODIFIED\n" };
    const d = diff(a, b);
    expect(d.stringHunks).toBeDefined();
    expect(d.stringHunks!["/body"]).toBeDefined();
  });

  it("honors per-path override forcing 'replace'", () => {
    const a = { body: "line one\nline two\n" };
    const b = { body: "line one\nline two MODIFIED\n" };
    const d = diff(a, b, { stringStrategy: { "/body": "replace" } });
    expect(d.stringHunks).toBeUndefined();
  });

  it("honors array identity via arrayId config", () => {
    const a = { items: [{ id: "1", n: 1 }, { id: "2", n: 2 }] };
    const b = { items: [{ id: "2", n: 2 }, { id: "1", n: 1 }] };
    const d = diff(a, b, { arrayId: { "/items": "id" } });
    expect(d.ops).toBeDefined();
  });

  it("accepts numeric array-id values", () => {
    const a = { items: [{ id: 1, n: 1 }, { id: 2, n: 2 }] };
    const b = { items: [{ id: 2, n: 2 }, { id: 1, n: 1 }] };
    const d = diff(a, b, { arrayId: { "/items": "id" } });
    expect(d.ops).toBeDefined();
  });
});
