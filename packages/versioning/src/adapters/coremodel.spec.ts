/**
 * Tests for CoreModelAdapter.
 *
 * CoreModel API findings (Step 1):
 *  - @webda/core's `CoreModel` is a thin wrapper: `class CoreModel extends UuidModel {}`,
 *    where `UuidModel` lives in `@webda/models`.
 *  - We test against `UuidModel` directly (from the built `@webda/models` lib),
 *    since `@webda/core` is not yet rebuilt on this branch. The adapter works
 *    identically for any UuidModel subclass.
 *  - Constructor: `new SubClass(data?)` — data is optional. UuidModel generates
 *    a random uuid when none is provided.
 *  - Serialization: `model.toJSON()` returns `this` (self-reference). No
 *    `toStoredJSON()` exists. We use `JSON.parse(JSON.stringify(model))`.
 *  - Rehydration: `model.load(plainData)` calls `constructor.deserialize(data, this)`
 *    which does Object.assign + optional per-field deserializers. Returns `this`.
 *  - Static: `Model.deserialize(data, instance?)` for more control.
 */
import { describe, it, expect } from "vitest";
import { UuidModel } from "@webda/models";

import { CoreModelAdapter } from "./coremodel.js";

class TestTask extends UuidModel {
  title!: string;
  description!: string;
  done!: boolean;
}

/**
 * Build a TestTask with controlled field values.
 * We pass uuid explicitly so the same uuid is shared across "version" instances
 * (diff/patch doesn't care, but it keeps the plain-JSON snapshots cleaner).
 */
function buildTask(init: Partial<TestTask>): TestTask {
  const t = new TestTask(init);
  // Use load() to apply any remaining fields (done, description, etc.)
  // that aren't set by UuidModel's constructor.
  t.load({ title: "", description: "", done: false, ...init } as any);
  return t;
}

describe("CoreModelAdapter", () => {
  it("round-trips diff + patch on a UuidModel subclass", () => {
    const uuid = "00000000-0000-0000-0000-000000000001";
    const a = buildTask({ uuid, title: "t1", description: "hello", done: false });
    const b = buildTask({ uuid, title: "t1", description: "hello world", done: true });

    const d = CoreModelAdapter.diff(a, b);
    const patched = CoreModelAdapter.patch(a, d);

    expect(patched).toBeInstanceOf(TestTask);
    expect(patched.title).toBe("t1");
    expect(patched.description).toBe("hello world");
    expect(patched.done).toBe(true);
  });

  it("returns no-op delta when models are equal", () => {
    const uuid = "00000000-0000-0000-0000-000000000002";
    const a = buildTask({ uuid, title: "same", description: "same", done: false });
    const b = buildTask({ uuid, title: "same", description: "same", done: false });

    const d = CoreModelAdapter.diff(a, b);
    expect(d.ops).toBeUndefined();
  });

  it("reverse produces inverse delta", () => {
    const uuid = "00000000-0000-0000-0000-000000000003";
    const a = buildTask({ uuid, title: "before", description: "x", done: false });
    const b = buildTask({ uuid, title: "after", description: "x", done: true });

    const d = CoreModelAdapter.diff(a, b);
    const reversed = CoreModelAdapter.reverse(d);
    const restored = CoreModelAdapter.patch(b, reversed);

    expect(restored).toBeInstanceOf(TestTask);
    expect(restored.title).toBe("before");
    expect(restored.done).toBe(false);
  });

  it("3-way merges UuidModel instances without conflict", () => {
    const uuid = "00000000-0000-0000-0000-000000000004";
    const base = buildTask({ uuid, title: "t", description: "base", done: false });
    const ours = buildTask({ uuid, title: "t ours", description: "base", done: false });
    const theirs = buildTask({ uuid, title: "t", description: "theirs", done: false });

    const r = CoreModelAdapter.merge3(base, ours, theirs);

    expect(r.clean).toBe(true);
    expect(r.merged).toBeInstanceOf(TestTask);
    expect(r.merged.title).toBe("t ours");
    expect(r.merged.description).toBe("theirs");
    expect(r.merged.done).toBe(false);
  });

  it("3-way merge detects conflicts when both sides change the same field differently", () => {
    const uuid = "00000000-0000-0000-0000-000000000005";
    const base = buildTask({ uuid, title: "original", description: "d", done: false });
    const ours = buildTask({ uuid, title: "ours title", description: "d", done: false });
    const theirs = buildTask({ uuid, title: "theirs title", description: "d", done: false });

    const r = CoreModelAdapter.merge3(base, ours, theirs);

    expect(r.clean).toBe(false);
    expect(r.conflicts.length).toBeGreaterThan(0);
  });
});
