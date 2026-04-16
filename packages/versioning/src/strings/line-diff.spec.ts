import { describe, it, expect } from "vitest";
import { lineDiff, lineApply, lineReverse } from "./line-diff.js";

describe("lineDiff / lineApply", () => {
  it("round-trips through patch/apply", () => {
    const a = "line one\nline two\nline three\n";
    const b = "line one\nline two modified\nline three\n";
    const hunks = lineDiff(a, b);
    expect(lineApply(a, hunks)).toBe(b);
  });

  it("produces empty hunks for equal strings", () => {
    const hunks = lineDiff("same\n", "same\n");
    expect(hunks.hunks.length).toBe(0);
  });

  it("lineReverse undoes a diff", () => {
    const a = "a\nb\nc\n";
    const b = "a\nB\nc\n";
    const hunks = lineDiff(a, b);
    const reversed = lineReverse(hunks);
    expect(lineApply(b, reversed)).toBe(a);
  });

  it("lineApply throws when hunks don't apply (context drift)", () => {
    const a = "one\ntwo\nthree\n";
    const b = "one\ntwo changed\nthree\n";
    const hunks = lineDiff(a, b);
    const drifted = "ONE\nTWO\nTHREE\n";
    expect(() => lineApply(drifted, hunks)).toThrow(/context|hunk|apply|mismatch/i);
  });

  it("round-trips a string without a trailing newline", () => {
    const a = "alpha\nbeta\ngamma";
    const b = "alpha\nBETA\ngamma";
    const hunks = lineDiff(a, b);
    expect(lineApply(a, hunks)).toBe(b);
    expect(lineApply(b, lineReverse(hunks))).toBe(a);
  });
});
