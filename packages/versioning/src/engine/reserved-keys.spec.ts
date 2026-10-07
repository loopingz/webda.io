import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { diff } from "./diff.js";
import { patch } from "./patch.js";
import { reverse } from "./reverse.js";

/**
 * jsondiffpatch marks array deltas with a `_t` key: user documents using `_t`
 * as a field name must still diff, patch and reverse correctly
 */
@suite("reserved keys")
class ReservedKeysTest {
  @test({ name: "reverses the addition of a `_t` key" })
  reversesAddedTKey() {
    // Counterexample found by the properties test
    const a = {};
    const b = { _t: [] };
    expect(patch(b, reverse(diff(a, b)))).toEqual(a);
  }

  @test({ name: "patches and reverses a changed nested `_t` key" })
  patchesChangedNestedTKey() {
    const a = { doc: { _t: "a", n: 1 } };
    const b = { doc: { _t: ["b"], n: 2 } };
    const d = diff(a, b);
    expect(patch(a, d)).toEqual(b);
    expect(patch(b, reverse(d))).toEqual(a);
  }

  @test({ name: "patches and reverses `_t` keys inside array items" })
  patchesTKeyInArrayItems() {
    const a = { items: [{ _t: "a" }, { _t: "b" }] };
    const b = { items: [{ _t: "b" }, { _t: "c" }, { _t: "a" }] };
    const d = diff(a, b);
    expect(patch(a, d)).toEqual(b);
    expect(patch(b, reverse(d))).toEqual(a);
  }

  @test({ name: "keeps `_t` and escaped-looking `~_t` keys distinct" })
  keepsEscapedLookingKeysDistinct() {
    const a = { _t: 1, "~_t": 2, "~~_t": 3 };
    const b = { _t: 4, "~_t": 5, "~~_t": 6 };
    const d = diff(a, b);
    expect(patch(a, d)).toEqual(b);
    expect(patch(b, reverse(d))).toEqual(a);
  }
}
