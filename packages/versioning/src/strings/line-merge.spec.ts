import { describe, expect, it } from "vitest";
import { lineMerge3 } from "./line-merge.js";

describe("lineMerge3", () => {
  it("clean merge when edits don't overlap", () => {
    const base = "line 1\nline 2\nline 3\n";
    const ours = "line 1 OURS\nline 2\nline 3\n";
    const theirs = "line 1\nline 2\nline 3 THEIRS\n";
    const r = lineMerge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toBe("line 1 OURS\nline 2\nline 3 THEIRS\n");
  });

  it("conflict when both sides edit the same line differently", () => {
    const base = "line 1\nline 2\nline 3\n";
    const ours = "line 1\nOURS\nline 3\n";
    const theirs = "line 1\nTHEIRS\nline 3\n";
    const r = lineMerge3(base, ours, theirs);
    expect(r.clean).toBe(false);
    // merged string returns the ours side by default at conflict points.
    expect(r.merged).toBe(ours);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].base).toBe("line 2\n");
    expect(r.conflicts[0].ours).toBe("OURS\n");
    expect(r.conflicts[0].theirs).toBe("THEIRS\n");
  });

  it("no conflict when both sides make the same change", () => {
    const base = "a\nb\nc\n";
    const ours = "a\nB\nc\n";
    const theirs = "a\nB\nc\n";
    const r = lineMerge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toBe(ours);
  });
});
