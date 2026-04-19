import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { merge3 } from "../engine/merge.js";
import { resolve } from "./resolve.js";
import type { Resolution } from "../types.js";

@suite("resolve")
class ResolveTest {
  @test({ name: "applies 'choose: ours' to a value conflict" })
  appliesChooseOursToAValueConflict() {
    const r = merge3({ a: 1 }, { a: 2 }, { a: 3 });
    expect(r.clean).toBe(false);
    const resolutions = new Map<string, Resolution>([["/a", { choose: "ours" }]]);
    const final = resolve(r, resolutions);
    expect(final.clean).toBe(true);
    expect(final.merged).toEqual({ a: 2 });
  }

  @test({ name: "applies 'choose: theirs'" })
  appliesChooseTheirs() {
    const r = merge3({ a: 1 }, { a: 2 }, { a: 3 });
    const final = resolve(r, new Map([["/a", { choose: "theirs" }]]));
    expect(final.clean).toBe(true);
    expect(final.merged).toEqual({ a: 3 });
  }

  @test({ name: "applies 'choose: base'" })
  appliesChooseBase() {
    const r = merge3({ a: 1 }, { a: 2 }, { a: 3 });
    const final = resolve(r, new Map([["/a", { choose: "base" }]]));
    expect(final.clean).toBe(true);
    expect(final.merged).toEqual({ a: 1 });
  }

  @test({ name: "applies 'value' resolution" })
  appliesValueResolution() {
    const r = merge3({ a: 1 }, { a: 2 }, { a: 3 });
    const final = resolve(r, new Map([["/a", { value: 42 }]]));
    expect(final.clean).toBe(true);
    expect(final.merged).toEqual({ a: 42 });
  }

  @test({ name: "applies 'text' resolution to a line conflict" })
  appliesTextResolutionToALineConflict() {
    const r = merge3(
      { body: "a\nb\nc\n" },
      { body: "a\nOURS\nc\n" },
      { body: "a\nTHEIRS\nc\n" }
    );
    expect(r.clean).toBe(false);
    const final = resolve(r, new Map([["/body", { text: "a\nRESOLVED\nc\n" }]]));
    expect(final.clean).toBe(true);
    expect(final.merged).toEqual({ body: "a\nRESOLVED\nc\n" });
  }

  @test({ name: "leaves unresolved conflicts in the result" })
  leavesUnresolvedConflictsInTheResult() {
    const r = merge3({ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 });
    expect(r.conflicts).toHaveLength(2);
    const final = resolve(r, new Map([["/a", { choose: "ours" }]]));
    expect(final.clean).toBe(false);
    expect(final.conflicts).toHaveLength(1);
    expect(final.conflicts[0].path).toBe("/b");
  }

  @test({ name: "is idempotent when the same resolutions are reapplied" })
  isIdempotentWhenTheSameResolutionsAreReapplied() {
    const r = merge3({ a: 1 }, { a: 2 }, { a: 3 });
    const once = resolve(r, new Map([["/a", { choose: "ours" }]]));
    const twice = resolve(once, new Map([["/a", { choose: "ours" }]]));
    expect(twice).toEqual(once);
  }
}
