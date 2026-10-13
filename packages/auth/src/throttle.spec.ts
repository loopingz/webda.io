import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  canSend,
  countAttempt,
  isLocked,
  markSent,
  recordFailure,
  resetFailures,
  type LoginAttempts
} from "./throttle.js";

@suite
class ThrottleTest {
  @test
  lockout() {
    let t: LoginAttempts = { _loginAttempts: 0 };
    const now = 1_000_000;
    for (let i = 0; i < 2; i++) t = recordFailure(t, now);
    assert.ok(!isLocked(t, 3, 900000, now));
    t = recordFailure(t, now);
    assert.ok(isLocked(t, 3, 900000, now + 1));
    assert.ok(!isLocked(t, 3, 900000, now + 900001));
    assert.deepStrictEqual(resetFailures(), { _loginAttempts: 0, _lastLoginAttemptAt: undefined });
  }

  @test
  sending() {
    const t = {};
    assert.ok(canSend(t, 1000, 5000));
    const sent = markSent(t, 5000);
    assert.ok(!canSend(sent, 1000, 5500));
    assert.ok(canSend(sent, 1000, 6001));
  }

  @test
  tolerant() {
    assert.ok(!isLocked(undefined as any, 3, 1000));
    assert.ok(canSend(undefined as any, 1000));
    assert.strictEqual(recordFailure(undefined as any, 1)._loginAttempts, 1);
    assert.deepStrictEqual(markSent(undefined as any, 2), { lastSentAt: 2 });
  }

  @test
  async countAttemptThrottling() {
    const store: any = { _attempts: 0 };
    const mockRef = {
      get: async () => ({ ...store }),
      incrementAttribute: async (attr: string) => {
        store[attr] = (store[attr] ?? 0) + 1;
        return { [attr]: store[attr] };
      },
      setAttribute: async (attr: string, val: any) => {
        store[attr] = val;
      }
    };

    // 1. First attempt - not locked (no snapshot passed)
    const locked1 = await countAttempt(mockRef, "_attempts", "_lastAttemptAt", {
      failedBeforeDelay: 2,
      lockout: 1000
    });
    assert.strictEqual(locked1, false);
    assert.strictEqual(store._attempts, 1);
    assert.ok(store._lastAttemptAt);

    // 2. Second attempt - reaches threshold, not yet locked
    const locked2 = await countAttempt(
      mockRef,
      "_attempts",
      "_lastAttemptAt",
      { failedBeforeDelay: 2, lockout: 1000 },
      store
    );
    assert.strictEqual(locked2, false);

    // 3. Third attempt - exceeds threshold, locked
    const locked3 = await countAttempt(
      mockRef,
      "_attempts",
      "_lastAttemptAt",
      { failedBeforeDelay: 2, lockout: 1000 },
      store
    );
    assert.strictEqual(locked3, true);

    // 4. Legacy entry without timestamp - expired lock behaves as unexpired reset
    const legacyStore: any = { _attempts: 5 };
    const legacyRef = {
      get: async () => ({ ...legacyStore }),
      incrementAttribute: async (attr: string) => {
        legacyStore[attr] = (legacyStore[attr] ?? 0) + 1;
        return undefined; // test fallback when incrementAttribute returns void
      },
      setAttribute: async (attr: string, val: any) => {
        legacyStore[attr] = val;
      }
    };
    const lockedLegacy = await countAttempt(legacyRef, "_attempts", "_lastAttemptAt", {
      failedBeforeDelay: 2,
      lockout: 1000
    });
    assert.strictEqual(lockedLegacy, false);
  }
}
