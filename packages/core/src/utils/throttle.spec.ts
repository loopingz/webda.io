import { suite, test } from "@webda/test";
import * as assert from "assert";
import { countAttempt } from "./throttle.js";

@suite
class ThrottleTest {
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

    // 5. Record never counted: the attribute is missing from the snapshot, default parameters apply
    const fresh: any = {};
    const freshRef = {
      get: async () => undefined,
      incrementAttribute: async (attr: string) => ({ [attr]: (fresh[attr] = (fresh[attr] ?? 0) + 1) }),
      setAttribute: async (attr: string, val: any) => {
        fresh[attr] = val;
      }
    };
    assert.strictEqual(await countAttempt(freshRef, "_attempts", "_lastAttemptAt", undefined, {}), false);
    assert.strictEqual(await countAttempt(freshRef, "_attempts", "_lastAttemptAt"), false);
    assert.strictEqual(fresh._attempts, 2);
  }
}
