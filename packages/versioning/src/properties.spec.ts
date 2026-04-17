import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { diff } from "./engine/diff.js";
import { patch } from "./engine/patch.js";
import { reverse } from "./engine/reverse.js";
import { merge3 } from "./engine/merge.js";
import { resolve } from "./conflicts/resolve.js";

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

describe("properties — merge3", () => {
  it("identity: merge3(x, x, x) is clean and equal to x", () => {
    fc.assert(
      fc.property(jsonValue, (x) => {
        const r = merge3(x, x, x);
        expect(r.clean).toEqual(true);
        expect(r.merged).toEqual(x);
      }),
      { numRuns: 100 }
    );
  });

  it("symmetry: swapping ours/theirs yields the same merged value when clean", () => {
    fc.assert(
      fc.property(jsonValue, jsonValue, jsonValue, (base, ours, theirs) => {
        const a = merge3(base, ours, theirs);
        const b = merge3(base, theirs, ours);
        if (a.clean && b.clean) {
          expect(a.merged).toEqual(b.merged);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("determinism: identical inputs produce identical outputs", () => {
    fc.assert(
      fc.property(jsonValue, jsonValue, jsonValue, (base, ours, theirs) => {
        const a = JSON.stringify(merge3(base, ours, theirs));
        const b = JSON.stringify(merge3(base, ours, theirs));
        expect(a).toEqual(b);
      }),
      { numRuns: 100 }
    );
  });
});

describe("properties — resolve", () => {
  it("idempotent: resolve(resolve(r, m), m) === resolve(r, m)", () => {
    fc.assert(
      fc.property(jsonValue, jsonValue, jsonValue, (base, ours, theirs) => {
        const r = merge3(base, ours, theirs);
        const resolutions = new Map(
          r.conflicts.map((c) => [c.path, { choose: "ours" } as const])
        );
        const once = resolve(r, resolutions);
        const twice = resolve(once, resolutions);
        expect(JSON.stringify(twice)).toEqual(JSON.stringify(once));
      }),
      { numRuns: 100 }
    );
  });
});
