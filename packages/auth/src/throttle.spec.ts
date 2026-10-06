import { suite, test } from "@webda/test";
import * as assert from "assert";
import { canSend, isLocked, markSent, recordFailure, resetFailures } from "./throttle.js";

@suite
class ThrottleTest {
  @test
  lockout() {
    let t = { attempts: 0 };
    const now = 1_000_000;
    for (let i = 0; i < 2; i++) t = recordFailure(t, now);
    assert.ok(!isLocked(t, 3, 900000, now));
    t = recordFailure(t, now);
    assert.ok(isLocked(t, 3, 900000, now + 1));
    assert.ok(!isLocked(t, 3, 900000, now + 900001));
    assert.deepStrictEqual(resetFailures(t), { attempts: 0, lastSentAt: undefined });
  }

  @test
  sending() {
    const t = { attempts: 0 };
    assert.ok(canSend(t, 1000, 5000));
    const sent = markSent(t, 5000);
    assert.ok(!canSend(sent, 1000, 5500));
    assert.ok(canSend(sent, 1000, 6001));
  }

  @test
  tolerant() {
    assert.ok(!isLocked(undefined as any, 3, 1000));
    assert.ok(canSend(undefined as any, 1000));
    assert.strictEqual(recordFailure(undefined as any, 1).attempts, 1);
  }
}
