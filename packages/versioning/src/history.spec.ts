import { expect } from "vitest";
import { suite, test } from "@webda/test";

import { diff } from "./engine/diff.js";
import { patch } from "./engine/patch.js";
import { wrap, unwrap, hash, commit } from "./history.js";

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

@suite("hash / commit")
class HashCommitTest {
  @test({ name: "hash returns a 64-character lowercase hex string" })
  async hashReturnsHex() {
    const vp = wrap(diff({ a: 1 }, { a: 2 }), { timestamp: 1, author: "a" });
    const h = await hash(vp);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  }

  @test({ name: "hash is deterministic for identical input" })
  async hashIsDeterministic() {
    const vp = wrap(diff({ a: 1 }, { a: 2 }), { timestamp: 42, author: "a", message: "m" });
    const h1 = await hash(vp);
    const h2 = await hash(vp);
    expect(h1).toBe(h2);
  }

  @test({ name: "hash is independent of key insertion order in the delta" })
  async hashIsOrderIndependent() {
    // Build two structurally-equal deltas via different insertion paths — hash must match.
    const vp1 = wrap(diff({ a: 1, b: 1 }, { a: 2, b: 2 }), { timestamp: 1 });
    const vp2 = wrap(diff({ b: 1, a: 1 }, { b: 2, a: 2 }), { timestamp: 1 });
    expect(await hash(vp1)).toBe(await hash(vp2));
  }

  @test({ name: "hash changes when author changes" })
  async hashChangesWithAuthor() {
    const d = diff({ a: 1 }, { a: 2 });
    const h1 = await hash(wrap(d, { timestamp: 1, author: "alice" }));
    const h2 = await hash(wrap(d, { timestamp: 1, author: "bob" }));
    expect(h1).not.toBe(h2);
  }

  @test({ name: "hash changes when timestamp changes" })
  async hashChangesWithTimestamp() {
    const d = diff({ a: 1 }, { a: 2 });
    const h1 = await hash(wrap(d, { timestamp: 1 }));
    const h2 = await hash(wrap(d, { timestamp: 2 }));
    expect(h1).not.toBe(h2);
  }

  @test({ name: "hash excludes id (different ids → same hash)" })
  async hashExcludesId() {
    const d = diff({ a: 1 }, { a: 2 });
    const h1 = await hash(wrap(d, { timestamp: 1, id: "x" }));
    const h2 = await hash(wrap(d, { timestamp: 1, id: "y" }));
    expect(h1).toBe(h2);
  }

  @test({ name: "commit populates id via hash" })
  async commitPopulatesId() {
    const d = diff({ a: 1 }, { a: 2 });
    const vp = await commit(d, { timestamp: 1, author: "a" });
    expect(vp.id).toMatch(/^[0-9a-f]{64}$/);
    // Hashing the resulting patch (id excluded) should match its own id.
    expect(await hash(vp)).toBe(vp.id);
  }

  @test({ name: "commit defaults timestamp to Date.now()" })
  async commitDefaultsTimestamp() {
    const before = Date.now();
    const vp = await commit(diff({ a: 1 }, { a: 2 }));
    const after = Date.now();
    expect(vp.timestamp).toBeGreaterThanOrEqual(before);
    expect(vp.timestamp).toBeLessThanOrEqual(after);
    expect(vp.id).toMatch(/^[0-9a-f]{64}$/);
  }
}
