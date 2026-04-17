import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { diff } from "./engine/diff.js";
import { patch } from "./engine/patch.js";
import { reverse } from "./engine/reverse.js";

// Arbitrary JSON value: objects/arrays of primitives + nested objects, bounded depth.
const jsonValue = fc.letrec(tie => ({
  leaf: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
  value: fc.oneof(
    { maxDepth: 3 },
    tie("leaf"),
    fc.array(tie("value"), { maxLength: 5 }),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), tie("value"), { maxKeys: 5 })
  )
})).value;

describe("properties", () => {
  it("patch(a, diff(a, b)) ≡ b", () => {
    fc.assert(
      fc.property(jsonValue, jsonValue, (a, b) => {
        const result = patch(a, diff(a, b));
        expect(result).toEqual(b);
      }),
      { numRuns: 100 }
    );
  });

  it("patch(b, reverse(diff(a, b))) ≡ a", () => {
    fc.assert(
      fc.property(jsonValue, jsonValue, (a, b) => {
        const result = patch(b, reverse(diff(a, b)));
        expect(result).toEqual(a);
      }),
      { numRuns: 100 }
    );
  });
});
