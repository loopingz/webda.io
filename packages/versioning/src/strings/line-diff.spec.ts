import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { lineDiff, lineApply, lineReverse } from "./line-diff.js";

@suite("lineDiff / lineApply")
class LineDiffTest {
  @test({ name: "round-trips through patch/apply" })
  roundTripsThroughPatchApply() {
    const a = "line one\nline two\nline three\n";
    const b = "line one\nline two modified\nline three\n";
    const hunks = lineDiff(a, b);
    expect(lineApply(a, hunks)).toBe(b);
  }

  @test({ name: "produces empty hunks for equal strings" })
  producesEmptyHunksForEqualStrings() {
    const hunks = lineDiff("same\n", "same\n");
    expect(hunks.hunks.length).toBe(0);
  }

  @test({ name: "lineReverse undoes a diff" })
  lineReverseUndoesADiff() {
    const a = "a\nb\nc\n";
    const b = "a\nB\nc\n";
    const hunks = lineDiff(a, b);
    const reversed = lineReverse(hunks);
    expect(lineApply(b, reversed)).toBe(a);
  }

  @test({ name: "lineApply throws when hunks don't apply (context drift)" })
  lineApplyThrowsWhenHunksDontApply() {
    const a = "one\ntwo\nthree\n";
    const b = "one\ntwo changed\nthree\n";
    const hunks = lineDiff(a, b);
    const drifted = "ONE\nTWO\nTHREE\n";
    expect(() => lineApply(drifted, hunks)).toThrow(/context|hunk|apply|mismatch/i);
  }

  @test({ name: "round-trips a string without a trailing newline" })
  roundTripsAStringWithoutATrailingNewline() {
    const a = "alpha\nbeta\ngamma";
    const b = "alpha\nBETA\ngamma";
    const hunks = lineDiff(a, b);
    expect(lineApply(a, hunks)).toBe(b);
    expect(lineApply(b, lineReverse(hunks))).toBe(a);
  }
}
