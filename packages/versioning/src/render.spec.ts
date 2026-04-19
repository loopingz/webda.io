import { expect } from "vitest";
import { suite, test } from "@webda/test";

import { diff } from "./engine/diff.js";
import { renderPatch, renderCommit } from "./render.js";
import { commit } from "./history.js";

@suite("renderPatch")
class RenderPatchTest {
  @test({ name: "produces a unified-diff header and hunks" })
  unifiedDiffHeader() {
    const base = { title: "old" };
    const next = { title: "new" };
    const out = renderPatch(base, diff(base, next));
    expect(out).toContain("--- base");
    expect(out).toContain("+++ patched");
    expect(out).toContain("@@");
    expect(out).toContain('-title: old');
    expect(out).toContain('+title: new');
  }

  @test({ name: "honors custom labels" })
  customLabels() {
    const out = renderPatch({ a: 1 }, diff({ a: 1 }, { a: 2 }), {
      fromLabel: "v1",
      toLabel: "v2"
    });
    expect(out).toContain("--- v1");
    expect(out).toContain("+++ v2");
  }

  @test({ name: "renders multiline strings as YAML block scalars (readable diff)" })
  multilineAsBlockScalar() {
    const base = { body: "line 1\nline 2\nline 3\n" };
    const next = { body: "line 1\nline TWO\nline 3\n" };
    const out = renderPatch(base, diff(base, next));
    // Block-scalar marker — yaml emits `body: |` (or `body: |-`) for multiline strings.
    expect(out).toMatch(/body: \|/);
    // The individual changed line appears without JSON-escape noise.
    expect(out).toContain("-  line 2");
    expect(out).toContain("+  line TWO");
  }

  @test({ name: "sorts keys by default for stable output" })
  sortsKeys() {
    const base = { b: 1, a: 1 };
    const next = { b: 2, a: 2 };
    const out = renderPatch(base, diff(base, next));
    // a should appear before b regardless of insertion order.
    const aPos = out.indexOf("a:");
    const bPos = out.indexOf("b:");
    expect(aPos).toBeGreaterThan(-1);
    expect(aPos).toBeLessThan(bPos);
  }

  @test({ name: "sortKeys: false preserves insertion order" })
  preservesOrder() {
    const base = { b: 1, a: 1 };
    const next = { b: 2, a: 2 };
    const out = renderPatch(base, diff(base, next), { sortKeys: false });
    const aPos = out.indexOf("a:");
    const bPos = out.indexOf("b:");
    expect(bPos).toBeLessThan(aPos);
  }

  @test({ name: "returns empty string for an identity delta" })
  identityDeltaEmpty() {
    const out = renderPatch({ a: 1 }, diff({ a: 1 }, { a: 1 }));
    expect(out).toBe("");
  }
}

@suite("renderCommit")
class RenderCommitTest {
  @test({ name: "prepends git-style commit header" })
  async commitHeader() {
    const base = { title: "draft" };
    const next = { title: "final" };
    const vp = await commit(diff(base, next), {
      timestamp: Date.parse("2026-04-17T10:00:00Z"),
      author: "alice@example.com",
      message: "finalize title"
    });
    const out = renderCommit(base, vp);
    expect(out).toMatch(/^commit [0-9a-f]{64}$/m);
    expect(out).toContain("Author: alice@example.com");
    expect(out).toContain("Date:   2026-04-17T10:00:00.000Z");
    expect(out).toContain("    finalize title");
    // Diff body still present after header
    expect(out).toContain("--- base");
    expect(out).toContain("-title: draft");
    expect(out).toContain("+title: final");
  }

  @test({ name: "omits author / message lines when those fields are absent" })
  async omitsOptional() {
    const base = { a: 1 };
    const vp = await commit(diff(base, { a: 2 }), { timestamp: 0 });
    const out = renderCommit(base, vp);
    expect(out).not.toContain("Author:");
    expect(out).not.toMatch(/^\s{4}\S/m); // no indented message line at all
    expect(out).toContain("Date:   1970-01-01T00:00:00.000Z");
  }
}
