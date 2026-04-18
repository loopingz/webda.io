import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { SchemaAdapter } from "./schema.js";

@suite("SchemaAdapter")
class SchemaAdapterTest {
  @test({ name: "carries config into diff/merge without re-specifying per call" })
  carriesConfigIntoDiffMergeWithoutReSpecifyingPerCall() {
    const adapter = SchemaAdapter.forSchema({
      arrayId: { "/items": "id" },
      stringStrategy: { "/description": "line" }
    });

    const base = { items: [{ id: "1", n: 1 }] };
    const ours = { items: [{ id: "1", n: 1 }, { id: "2", n: 2 }] };
    const theirs = { items: [{ id: "1", n: 1 }, { id: "3", n: 3 }] };

    const r = adapter.merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect((r.merged as { items: unknown[] }).items).toHaveLength(3);
  }

  @test({ name: "exposes diff, patch, reverse with fixed config" })
  exposesDiffPatchReverseWithFixedConfig() {
    const adapter = SchemaAdapter.forSchema({ arrayId: { "/items": "id" } });
    const a = { items: [{ id: "1", n: 1 }] };
    const b = { items: [{ id: "1", n: 2 }] };
    const d = adapter.diff(a, b);
    expect(adapter.patch(a, d)).toEqual(b);
    expect(adapter.patch(b, adapter.reverse(d))).toEqual(a);
  }
}
