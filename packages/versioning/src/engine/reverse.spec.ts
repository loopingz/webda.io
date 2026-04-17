import { describe, it, expect } from "vitest";
import { diff } from "./diff.js";
import { patch } from "./patch.js";
import { reverse } from "./reverse.js";

describe("reverse", () => {
  it("reverses a structural delta", () => {
    const a = { a: 1 };
    const b = { a: 2 };
    const d = diff(a, b);
    expect(patch(b, reverse(d))).toEqual(a);
  });

  it("reverses a line-strategy delta", () => {
    const a = { body: "one\ntwo\n" };
    const b = { body: "one\nTWO\n" };
    const d = diff(a, b);
    expect(patch(b, reverse(d))).toEqual(a);
  });

  it("is its own inverse: reverse(reverse(d)) === d semantically", () => {
    const a = { a: 1 };
    const b = { a: 2 };
    const d = diff(a, b);
    const rr = reverse(reverse(d));
    expect(patch(a, rr)).toEqual(b);
  });
});
