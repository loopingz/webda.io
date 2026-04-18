import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { lineMerge3 } from "./line-merge.js";

@suite("lineMerge3")
class LineMerge3Test {
  @test({ name: "clean merge when edits don't overlap" })
  cleanMergeWhenEditsDontOverlap() {
    const base = "line 1\nline 2\nline 3\n";
    const ours = "line 1 OURS\nline 2\nline 3\n";
    const theirs = "line 1\nline 2\nline 3 THEIRS\n";
    const r = lineMerge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toBe("line 1 OURS\nline 2\nline 3 THEIRS\n");
  }

  @test({ name: "conflict when both sides edit the same line differently" })
  conflictWhenBothSidesEditTheSameLineDifferently() {
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
  }

  @test({ name: "no conflict when both sides make the same change" })
  noConflictWhenBothSidesMakeTheSameChange() {
    const base = "a\nb\nc\n";
    const ours = "a\nB\nc\n";
    const theirs = "a\nB\nc\n";
    const r = lineMerge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toBe(ours);
  }
}
