import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { merge3 } from "../engine/merge.js";
import { toGitMarkers, fromGitMarkers } from "./markers.js";

@suite("toGitMarkers")
class ToGitMarkersTest {
  @test({ name: "embeds markers in line conflicts" })
  embedsMarkersInLineConflicts() {
    const r = merge3(
      { body: "a\nb\nc\n" },
      { body: "a\nOURS\nc\n" },
      { body: "a\nTHEIRS\nc\n" }
    );
    const withMarkers = toGitMarkers(r) as { body: string };
    expect(withMarkers.body).toContain("<<<<<<<");
    expect(withMarkers.body).toContain("OURS");
    expect(withMarkers.body).toContain("=======");
    expect(withMarkers.body).toContain("THEIRS");
    expect(withMarkers.body).toContain(">>>>>>>");
  }

  @test({ name: "replaces non-string conflicts with a sentinel" })
  replacesNonStringConflictsWithASentinel() {
    const r = merge3({ a: 1 }, { a: 2 }, { a: 3 });
    const withMarkers = toGitMarkers(r) as { a: unknown };
    expect(withMarkers.a).toEqual({ __conflict: true, base: 1, ours: 2, theirs: 3 });
  }

  @test({ name: "leaves non-conflicting regions untouched" })
  leavesNonConflictingRegionsUntouched() {
    const r = merge3({ a: 1, b: 1 }, { a: 1, b: 2 }, { a: 1, b: 2 });
    expect(r.clean).toBe(true);
    const withMarkers = toGitMarkers(r);
    expect(withMarkers).toEqual({ a: 1, b: 2 });
  }
}

@suite("fromGitMarkers")
class FromGitMarkersTest {
  @test({ name: "reconstructs a clean MergeResult when all conflicts are resolved" })
  reconstructsACleanMergeResultWhenAllConflictsAreResolved() {
    const r = merge3(
      { body: "a\nb\nc\n" },
      { body: "a\nOURS\nc\n" },
      { body: "a\nTHEIRS\nc\n" }
    );
    const edited = { body: "a\nRESOLVED\nc\n" };
    const final = fromGitMarkers(edited, r);
    expect(final.clean).toBe(true);
    expect(final.merged).toEqual({ body: "a\nRESOLVED\nc\n" });
  }

  @test({ name: "reports still-unresolved conflicts when markers remain" })
  reportsStillUnresolvedConflictsWhenMarkersRemain() {
    const r = merge3(
      { body: "a\nb\nc\n" },
      { body: "a\nOURS\nc\n" },
      { body: "a\nTHEIRS\nc\n" }
    );
    const withMarkers = toGitMarkers(r); // still contains markers
    const final = fromGitMarkers(withMarkers, r);
    expect(final.clean).toBe(false);
    expect(final.conflicts).toHaveLength(1);
  }

  @test({ name: "resolves sentinel replacements for non-string conflicts" })
  resolvesSentinelReplacementsForNonStringConflicts() {
    const r = merge3({ a: 1 }, { a: 2 }, { a: 3 });
    const withMarkers = toGitMarkers(r) as { a: unknown };
    withMarkers.a = 99;
    const final = fromGitMarkers(withMarkers, r);
    expect(final.clean).toBe(true);
    expect(final.merged).toEqual({ a: 99 });
  }
}
