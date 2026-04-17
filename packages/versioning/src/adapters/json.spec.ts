import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { JsonAdapter } from "./json.js";

@suite("JsonAdapter")
class JsonAdapterTest {
  @test({ name: "diffs and patches with no extra wrapping" })
  diffsAndPatchesWithNoExtraWrapping() {
    const a = { a: 1 };
    const b = { a: 2 };
    const d = JsonAdapter.diff(a, b);
    expect(JsonAdapter.patch(a, d)).toEqual(b);
  }

  @test({ name: "merges 3-way with no transformation" })
  merges3WayWithNoTransformation() {
    const r = JsonAdapter.merge3({ a: 1 }, { a: 2 }, { a: 2 });
    expect(r.clean).toBe(true);
    expect(r.merged).toEqual({ a: 2 });
  }

  @test({ name: "reverse round-trips" })
  reverseRoundTrips() {
    const a = { a: 1 };
    const b = { a: 2 };
    const d = JsonAdapter.diff(a, b);
    expect(JsonAdapter.patch(b, JsonAdapter.reverse(d))).toEqual(a);
  }

  @test({ name: "forwards cfg to diff and merge3" })
  forwardsCfgToDiffAndMerge3() {
    const cfg = { arrayId: { "/items": "id" } };
    const base = { items: [{ id: "1", v: 1 }] };
    const ours = { items: [{ id: "1", v: 1 }, { id: "2", v: 2 }] };
    const theirs = { items: [{ id: "1", v: 1 }, { id: "3", v: 3 }] };
    const r = JsonAdapter.merge3(base, ours, theirs, cfg);
    expect(r.clean).toBe(true);
    expect((r.merged as { items: unknown[] }).items).toHaveLength(3);
  }
}
