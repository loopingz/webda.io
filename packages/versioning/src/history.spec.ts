import { expect } from "vitest";
import { suite, test } from "@webda/test";

import { diff } from "./engine/diff.js";
import { patch } from "./engine/patch.js";
import { wrap, unwrap } from "./history.js";

@suite("VersionedPatch")
class VersionedPatchTest {
  @test({ name: "wrap defaults timestamp to Date.now()" })
  wrapDefaultsTimestamp() {
    const before = Date.now();
    const vp = wrap(diff({ a: 1 }, { a: 2 }));
    const after = Date.now();
    expect(vp.timestamp).toBeGreaterThanOrEqual(before);
    expect(vp.timestamp).toBeLessThanOrEqual(after);
    expect(vp.author).toBeUndefined();
    expect(vp.message).toBeUndefined();
    expect(vp.id).toBeUndefined();
  }

  @test({ name: "wrap honors provided metadata" })
  wrapHonorsMetadata() {
    const d = diff({ a: 1 }, { a: 2 });
    const vp = wrap(d, {
      timestamp: 1_700_000_000_000,
      author: "alice@example.com",
      message: "bump a",
      id: "patch-001"
    });
    expect(vp.delta).toBe(d);
    expect(vp.timestamp).toBe(1_700_000_000_000);
    expect(vp.author).toBe("alice@example.com");
    expect(vp.message).toBe("bump a");
    expect(vp.id).toBe("patch-001");
  }

  @test({ name: "unwrap returns the underlying delta" })
  unwrapReturnsDelta() {
    const d = diff({ a: 1 }, { a: 2 });
    const vp = wrap(d, { author: "bob" });
    expect(unwrap(vp)).toBe(d);
  }

  @test({ name: "integrates with patch via unwrap" })
  integratesWithPatch() {
    const a = { a: 1 };
    const b = { a: 2 };
    const vp = wrap(diff(a, b), { author: "ci" });
    expect(patch(a, unwrap(vp))).toEqual(b);
  }

  @test({ name: "is JSON-serializable round-trip" })
  jsonRoundTrip() {
    const vp = wrap(diff({ a: 1 }, { a: 2 }), {
      timestamp: 1_700_000_000_000,
      author: "alice",
      message: "bump",
      id: "p-1"
    });
    const parsed = JSON.parse(JSON.stringify(vp));
    expect(parsed.timestamp).toBe(1_700_000_000_000);
    expect(parsed.author).toBe("alice");
    expect(parsed.message).toBe("bump");
    expect(parsed.id).toBe("p-1");
    expect(parsed.delta.__versioning).toBe(1);
  }
}
