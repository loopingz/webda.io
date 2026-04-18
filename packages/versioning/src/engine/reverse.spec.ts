import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { diff } from "./diff.js";
import { patch } from "./patch.js";
import { reverse } from "./reverse.js";

@suite("reverse")
class ReverseTest {
  @test({ name: "reverses a structural delta" })
  reversesAStructuralDelta() {
    const a = { a: 1 };
    const b = { a: 2 };
    const d = diff(a, b);
    expect(patch(b, reverse(d))).toEqual(a);
  }

  @test({ name: "reverses a line-strategy delta" })
  reversesALineStrategyDelta() {
    const a = { body: "one\ntwo\n" };
    const b = { body: "one\nTWO\n" };
    const d = diff(a, b);
    expect(patch(b, reverse(d))).toEqual(a);
  }

  @test({ name: "is its own inverse: reverse(reverse(d)) === d semantically" })
  isItsOwnInverse() {
    const a = { a: 1 };
    const b = { a: 2 };
    const d = diff(a, b);
    const rr = reverse(reverse(d));
    expect(patch(a, rr)).toEqual(b);
  }
}
