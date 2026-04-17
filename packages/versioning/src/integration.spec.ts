import { describe, it, expect } from "vitest";

import { diff } from "./engine/diff.js";
import { patch } from "./engine/patch.js";
import { merge3 } from "./engine/merge.js";
import { resolve } from "./conflicts/resolve.js";
import { toGitMarkers, fromGitMarkers } from "./conflicts/markers.js";

describe("integration — full workflow across modules", () => {
  it("merge3 → toGitMarkers → user-edit → fromGitMarkers → resolve → patch", () => {
    const base = { title: "draft", body: "a\nb\nc\n", tags: ["x"] };
    const ours = { title: "draft v2", body: "a\nOURS\nc\n", tags: ["x", "y"] };
    const theirs = { title: "draft v3", body: "a\nTHEIRS\nc\n", tags: ["x", "z"] };

    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(false);

    // title: value conflict; body: line conflict; tags: whole-array conflict (no arrayId)
    const withMarkers = toGitMarkers(r) as Record<string, unknown>;
    expect(typeof withMarkers.body).toBe("string");
    expect(withMarkers.body).toMatch(/^<{7}/m);

    // User manually edits the body field to resolve it; leaves title sentinel alone
    // and leaves tags sentinel alone.
    (withMarkers as { body: string }).body = "a\nRESOLVED\nc\n";

    const afterMarkers = fromGitMarkers(withMarkers, r);
    // body resolved; title + tags still unresolved (sentinels intact)
    expect(afterMarkers.clean).toBe(false);
    expect(afterMarkers.conflicts.map((c) => c.path).sort()).toEqual(["/tags", "/title"]);

    // Resolve the remaining two via the programmatic API
    const final = resolve(
      afterMarkers,
      new Map([
        ["/title", { choose: "ours" }],
        ["/tags", { value: ["x", "y", "z"] }]
      ])
    );
    expect(final.clean).toBe(true);
    expect(final.merged).toEqual({
      title: "draft v2",
      body: "a\nRESOLVED\nc\n",
      tags: ["x", "y", "z"]
    });

    // The fully-merged result must remain patchable — compute a further delta
    // and round-trip it to confirm the merged object has not drifted into an
    // unpatchable shape.
    const next = { ...final.merged, published: true };
    const d = diff(final.merged, next);
    expect(patch(final.merged, d)).toEqual(next);
  });
});
