import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { diff } from "./diff.js";

@suite("diff")
class DiffTest {
  @test({ name: "returns a branded delta" })
  returnsABrandedDelta() {
    const d = diff({ a: 1 }, { a: 2 });
    expect(d.__versioning).toBe(1);
    expect(d.ops).toBeDefined();
  }

  @test({ name: "returns undefined-ops delta for equal objects" })
  returnsUndefinedOpsDeltaForEqualObjects() {
    const d = diff({ a: 1 }, { a: 1 });
    expect(d.ops).toBeUndefined();
    expect(d.stringHunks).toBeUndefined();
  }

  @test({ name: "uses replace strategy for single-line strings (no stringHunks)" })
  usesReplaceStrategyForSingleLineStrings() {
    const d = diff({ title: "old" }, { title: "new" });
    expect(d.stringHunks).toBeUndefined();
    expect(d.ops).toBeDefined();
  }

  @test({ name: "uses line strategy for multiline strings (produces stringHunks)" })
  usesLineStrategyForMultilineStrings() {
    const a = { body: "line one\nline two\n" };
    const b = { body: "line one\nline two MODIFIED\n" };
    const d = diff(a, b);
    expect(d.stringHunks).toBeDefined();
    expect(d.stringHunks!["/body"]).toBeDefined();
  }

  @test({ name: "honors per-path override forcing 'replace'" })
  honorsPerPathOverrideForcingReplace() {
    const a = { body: "line one\nline two\n" };
    const b = { body: "line one\nline two MODIFIED\n" };
    const d = diff(a, b, { stringStrategy: { "/body": "replace" } });
    expect(d.stringHunks).toBeUndefined();
  }

  @test({ name: "honors array identity via arrayId config" })
  honorsArrayIdentityViaArrayIdConfig() {
    const a = { items: [{ id: "1", n: 1 }, { id: "2", n: 2 }] };
    const b = { items: [{ id: "2", n: 2 }, { id: "1", n: 1 }] };
    const d = diff(a, b, { arrayId: { "/items": "id" } });
    expect(d.ops).toBeDefined();
  }

  @test({ name: "accepts numeric array-id values" })
  acceptsNumericArrayIdValues() {
    const a = { items: [{ id: 1, n: 1 }, { id: 2, n: 2 }] };
    const b = { items: [{ id: 2, n: 2 }, { id: 1, n: 1 }] };
    const d = diff(a, b, { arrayId: { "/items": "id" } });
    expect(d.ops).toBeDefined();
  }
}
