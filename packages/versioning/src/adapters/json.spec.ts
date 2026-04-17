import { describe, it, expect } from "vitest";
import { JsonAdapter } from "./json.js";

describe("JsonAdapter", () => {
  it("diffs and patches with no extra wrapping", () => {
    const a = { a: 1 };
    const b = { a: 2 };
    const d = JsonAdapter.diff(a, b);
    expect(JsonAdapter.patch(a, d)).toEqual(b);
  });

  it("merges 3-way with no transformation", () => {
    const r = JsonAdapter.merge3({ a: 1 }, { a: 2 }, { a: 2 });
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual({ a: 2 });
  });

  it("reverse round-trips", () => {
    const a = { a: 1 };
    const b = { a: 2 };
    const d = JsonAdapter.diff(a, b);
    expect(JsonAdapter.patch(b, JsonAdapter.reverse(d))).toEqual(a);
  });

  it("forwards cfg to diff and merge3", () => {
    const cfg = { arrayId: { "/items": "id" } };
    const base = { items: [{ id: "1", v: 1 }] };
    const ours = { items: [{ id: "1", v: 1 }, { id: "2", v: 2 }] };
    const theirs = { items: [{ id: "1", v: 1 }, { id: "3", v: 3 }] };
    const r = JsonAdapter.merge3(base, ours, theirs, cfg);
    expect(r.clean).toBe(true);
    expect((r.merged as { items: unknown[] }).items).toHaveLength(3);
  });
});
