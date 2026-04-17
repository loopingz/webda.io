import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { merge3 } from "./merge.js";

@suite("merge3 (values/scalars)")
class Merge3ValuesScalarsTest {
  @test({ name: "clean merge of disjoint changes" })
  cleanMergeOfDisjointChanges() {
    const base = { a: 1, b: 1 };
    const ours = { a: 2, b: 1 };
    const theirs = { a: 1, b: 2 };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual({ a: 2, b: 2 });
  }

  @test({ name: "same change on both sides is not a conflict" })
  sameChangeOnBothSidesIsNotAConflict() {
    const base = { a: 1 };
    const ours = { a: 2 };
    const theirs = { a: 2 };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual({ a: 2 });
  }

  @test({ name: "conflict when both sides set same key to different values" })
  conflictWhenBothSidesSetSameKeyToDifferentValues() {
    const base = { a: 1 };
    const ours = { a: 2 };
    const theirs = { a: 3 };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(false);
    expect(r.conflicts).toHaveLength(1);
    const c = r.conflicts[0];
    expect(c.path).toBe("/a");
    expect(c.kind).toBe("value");
    expect(c.base).toBe(1);
    expect(c.ours).toBe(2);
    expect(c.theirs).toBe(3);
  }

  @test({ name: "delete-modify conflict: ours deletes, theirs modifies" })
  deleteModifyConflictOursDeletesTheirsModifies() {
    const base = { a: 1 };
    const ours = {};
    const theirs = { a: 2 };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(false);
    expect(r.conflicts[0].kind).toBe("delete-modify");
  }

  @test({ name: "delete-modify conflict: theirs deletes, ours modifies" })
  deleteModifyConflictTheirsDeletesOursModifies() {
    const base = { a: 1 };
    const ours = { a: 2 };
    const theirs = {};
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(false);
    expect(r.conflicts[0].kind).toBe("delete-modify");
  }

  @test({ name: "identity: merge3(x, x, x) is clean and equal to x" })
  identityMerge3IsCleanAndEqualToX() {
    const x = { a: 1, b: { c: "hi" } };
    const r = merge3(x, x, x);
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual(x);
    expect(r.conflicts).toEqual([]);
  }

  @test({ name: "nested clean merge" })
  nestedCleanMerge() {
    const base = { x: { a: 1, b: 1 } };
    const ours = { x: { a: 2, b: 1 } };
    const theirs = { x: { a: 1, b: 2 } };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual({ x: { a: 2, b: 2 } });
  }

  @test({ name: "only one side changed takes that side" })
  onlyOneSideChangedTakesThatSide() {
    const base = { a: 1, b: 1 };
    const ours = { a: 2, b: 1 };
    const theirs = { a: 1, b: 1 };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual({ a: 2, b: 1 });
  }

  @test({ name: "NaN values compare equal (no spurious conflict)" })
  nanValuesCompareEqualNoSpuriousConflict() {
    const r = merge3({ v: NaN }, { v: NaN }, { v: NaN });
    expect(r.clean).toBe(true);
    expect(Number.isNaN((r.merged as { v: number }).v)).toBe(true);
  }
}

@suite("merge3 (arrays)")
class Merge3ArraysTest {
  cfg = { arrayId: { "/items": "id" } };

  @test({ name: "inserts from both sides when arrayId is configured" })
  insertsFromBothSidesWhenArrayIdIsConfigured() {
    const base = { items: [{ id: "1", v: 1 }] };
    const ours = { items: [{ id: "1", v: 1 }, { id: "2", v: 2 }] };
    const theirs = { items: [{ id: "1", v: 1 }, { id: "3", v: 3 }] };
    const r = merge3(base, ours, theirs, this.cfg);
    expect(r.clean).toBe(true);
    expect(r.merged.items).toEqual(
      expect.arrayContaining([
        { id: "1", v: 1 },
        { id: "2", v: 2 },
        { id: "3", v: 3 }
      ])
    );
    expect(r.merged.items).toHaveLength(3);
  }

  @test({ name: "recurses into items modified on both sides (clean)" })
  recursesIntoItemsModifiedOnBothSidesClean() {
    const base = { items: [{ id: "1", a: 1, b: 1 }] };
    const ours = { items: [{ id: "1", a: 2, b: 1 }] };
    const theirs = { items: [{ id: "1", a: 1, b: 2 }] };
    const r = merge3(base, ours, theirs, this.cfg);
    expect(r.clean).toBe(true);
    expect(r.merged.items[0]).toEqual({ id: "1", a: 2, b: 2 });
  }

  @test({ name: "raises delete-modify conflict on array items" })
  raisesDeleteModifyConflictOnArrayItems() {
    const base = { items: [{ id: "1", v: 1 }] };
    const ours = { items: [] };
    const theirs = { items: [{ id: "1", v: 2 }] };
    const r = merge3(base, ours, theirs, this.cfg);
    expect(r.clean).toBe(false);
    const c = r.conflicts[0];
    expect(c.kind).toBe("delete-modify");
    expect(c.path).toBe("/items/1");
  }

  @test({ name: "JSON-pointer-escapes ids containing '/' or '~'" })
  jsonPointerEscapesIdsContainingSlashOrTilde() {
    const base = { items: [{ id: "us/east", v: 1 }] };
    const ours = { items: [] };
    const theirs = { items: [{ id: "us/east", v: 2 }] };
    const r = merge3(base, ours, theirs, this.cfg);
    expect(r.clean).toBe(false);
    // '/' must be escaped as ~1 in a JSON Pointer segment.
    expect(r.conflicts[0].path).toBe("/items/us~1east");
  }

  @test({ name: "without arrayId, any array change falls back to whole-array conflict" })
  withoutArrayIdAnyArrayChangeFallsBackToWholeArrayConflict() {
    const base = { items: [1, 2, 3] };
    const ours = { items: [1, 2, 4] };
    const theirs = { items: [0, 2, 3] };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(false);
    const c = r.conflicts[0];
    expect(c.path).toBe("/items");
    expect(c.kind).toBe("value");
  }

  @test({ name: "without arrayId and only one side changed, takes that side" })
  withoutArrayIdAndOnlyOneSideChangedTakesThatSide() {
    const base = { items: [1, 2, 3] };
    const ours = { items: [1, 2, 4] };
    const theirs = { items: [1, 2, 3] };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual(ours);
  }
}

@suite("merge3 (line-strategy strings)")
class Merge3LineStrategyStringsTest {
  @test({ name: "clean line merge when edits don't overlap" })
  cleanLineMergeWhenEditsDontOverlap() {
    const base = { body: "line 1\nline 2\nline 3\n" };
    const ours = { body: "line 1 OURS\nline 2\nline 3\n" };
    const theirs = { body: "line 1\nline 2\nline 3 THEIRS\n" };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged.body).toBe("line 1 OURS\nline 2\nline 3 THEIRS\n");
  }

  @test({ name: "line conflict with hunks populated" })
  lineConflictWithHunksPopulated() {
    const base = { body: "a\nb\nc\n" };
    const ours = { body: "a\nOURS\nc\n" };
    const theirs = { body: "a\nTHEIRS\nc\n" };
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(false);
    const c = r.conflicts.find((c) => c.path === "/body");
    expect(c).toBeDefined();
    expect(c!.kind).toBe("line");
    // Narrow: c has kind "line", so hunks is required.
    if (c!.kind === "line") {
      expect(c!.hunks).toBeDefined();
      expect(c!.hunks.ours).toBeDefined();
      expect(c!.hunks.theirs).toBeDefined();
    }
    // merged default = ours side at conflict
    expect(r.merged.body).toBe(ours.body);
  }

  @test({ name: "single-line strings still produce value conflicts (not line)" })
  singleLineStringsStillProduceValueConflicts() {
    const r = merge3({ title: "base" }, { title: "ours" }, { title: "theirs" });
    expect(r.clean).toBe(false);
    expect(r.conflicts[0].kind).toBe("value");
  }

  @test({ name: "short multiline strings under multilineThreshold use replace strategy" })
  shortMultilineStringsUnderMultilineThresholdUseReplaceStrategy() {
    const cfg = { multilineThreshold: 100 };
    const base = { body: "a\nb\n" };
    const ours = { body: "x\nb\n" };
    const theirs = { body: "a\ny\n" };
    const r = merge3(base, ours, theirs, cfg);
    // body is 4 chars < 100 → replace → value conflict, not line
    expect(r.conflicts[0].kind).toBe("value");
  }

  @test({ name: "strategy is symmetric: swapping ours/theirs gives the same strategy" })
  strategyIsSymmetricSwappingOursTheirsGivesSameStrategy() {
    // Regression test: probing `base` (not `theirs`) for strategy selection
    // means the decision doesn't flip when callers swap ours/theirs.
    const base = { body: "one\ntwo\nthree\n" };
    const ours = { body: "one\nOURS\nthree\n" };
    const theirs = { body: "one\nTHEIRS\nthree\n" };
    const r1 = merge3(base, ours, theirs);
    const r2 = merge3(base, theirs, ours);
    expect(r1.conflicts[0].kind).toBe("line");
    expect(r2.conflicts[0].kind).toBe("line");
  }
}
