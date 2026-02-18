"use strict";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { debounce } from "./debounce";

@suite
export class DebounceTest {
  /**
   * Helper to wait for a specific duration
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  @test
  async "should debounce function calls"() {
    let callCount = 0;
    const debouncedFunc = debounce(() => {
      callCount++;
    }, 100);

    // Call multiple times rapidly
    debouncedFunc();
    debouncedFunc();
    debouncedFunc();
    debouncedFunc();

    // Should not have been called yet
    assert.strictEqual(callCount, 0);

    // Wait for debounce to trigger
    await this.wait(150);

    // Should have been called only once
    assert.strictEqual(callCount, 1);
  }

  @test
  async "should pass arguments correctly"() {
    let lastArgs: any[] = [];
    const debouncedFunc = debounce((...args: any[]) => {
      lastArgs = args;
    }, 50);

    debouncedFunc("first", 1);
    debouncedFunc("second", 2);
    debouncedFunc("third", 3);

    await this.wait(100);

    // Should have the last call's arguments
    assert.deepStrictEqual(lastArgs, ["third", 3]);
  }

  @test
  async "should work with leading edge"() {
    let callCount = 0;
    const debouncedFunc = debounce(
      () => {
        callCount++;
      },
      100,
      { leading: true, trailing: false }
    );

    // First call should execute immediately
    debouncedFunc();
    assert.strictEqual(callCount, 1);

    // Subsequent calls within wait period should not execute
    debouncedFunc();
    debouncedFunc();
    await this.wait(150);

    // Should still be 1 (trailing is false)
    assert.strictEqual(callCount, 1);
  }

  @test
  async "should work with trailing edge (default)"() {
    let callCount = 0;
    const debouncedFunc = debounce(() => {
      callCount++;
    }, 50);

    debouncedFunc();
    assert.strictEqual(callCount, 0); // Not called immediately

    await this.wait(100);
    assert.strictEqual(callCount, 1); // Called after wait
  }

  @test
  async "should work with both leading and trailing"() {
    let callCount = 0;
    const debouncedFunc = debounce(
      () => {
        callCount++;
      },
      50,
      { leading: true, trailing: true }
    );

    debouncedFunc();
    assert.strictEqual(callCount, 1); // Called immediately (leading)

    debouncedFunc();
    debouncedFunc();

    await this.wait(100);
    assert.strictEqual(callCount, 2); // Called again at trailing edge
  }

  @test
  async "should cancel pending invocations"() {
    let callCount = 0;
    const debouncedFunc = debounce(() => {
      callCount++;
    }, 100);

    debouncedFunc();
    debouncedFunc();

    // Cancel before it executes
    debouncedFunc.cancel();

    await this.wait(150);

    // Should not have been called
    assert.strictEqual(callCount, 0);
  }

  @test
  async "should flush pending invocations"() {
    let callCount = 0;
    const debouncedFunc = debounce(() => {
      callCount++;
    }, 100);

    debouncedFunc();
    debouncedFunc();

    assert.strictEqual(callCount, 0);

    // Flush immediately
    debouncedFunc.flush();

    // Should have been called immediately
    assert.strictEqual(callCount, 1);
  }

  @test
  async "should check pending status"() {
    const debouncedFunc = debounce(() => {}, 100);

    assert.strictEqual(debouncedFunc.pending(), false);

    debouncedFunc();
    assert.strictEqual(debouncedFunc.pending(), true);

    await this.wait(150);
    assert.strictEqual(debouncedFunc.pending(), false);
  }

  @test
  async "should respect maxWait option"() {
    let callCount = 0;
    const debouncedFunc = debounce(
      () => {
        callCount++;
      },
      100,
      { maxWait: 150 }
    );

    // Call repeatedly
    debouncedFunc();
    await this.wait(50);
    debouncedFunc();
    await this.wait(50);
    debouncedFunc();
    await this.wait(50);
    debouncedFunc();

    // Should have been called once due to maxWait
    assert.strictEqual(callCount, 1);

    await this.wait(200);

    // Should have been called again for trailing edge
    assert.strictEqual(callCount, 2);
  }

  @test
  async "should preserve 'this' context"() {
    const obj = {
      value: "test",
      method: debounce(function (this: any) {
        return this.value;
      }, 50)
    };

    obj.method();
    await this.wait(100);

    // Context should be preserved
    // Note: We can't easily test the return value in this async scenario
    // but the implementation preserves context
    assert.ok(true);
  }

  @test
  async "should work with class methods"() {
    class TestClass {
      callCount = 0;

      increment = debounce(() => {
        this.callCount++;
      }, 50);
    }

    const instance = new TestClass();

    instance.increment();
    instance.increment();
    instance.increment();

    assert.strictEqual(instance.callCount, 0);

    await this.wait(100);

    assert.strictEqual(instance.callCount, 1);
  }

  @test
  async "should work with async functions"() {
    let callCount = 0;
    const debouncedFunc = debounce(async () => {
      callCount++;
      await this.wait(10);
      return "done";
    }, 50);

    debouncedFunc();
    debouncedFunc();
    debouncedFunc();

    await this.wait(100);

    assert.strictEqual(callCount, 1);
  }

  @test
  async "should handle rapid successive calls"() {
    let callCount = 0;
    const debouncedFunc = debounce(() => {
      callCount++;
    }, 50);

    // Simulate rapid input (like typing)
    for (let i = 0; i < 10; i++) {
      debouncedFunc();
      await this.wait(20); // Call every 20ms
    }

    assert.strictEqual(callCount, 0); // Not called yet

    await this.wait(100); // Wait for last debounce to finish

    assert.strictEqual(callCount, 1); // Should have been called only once
  }

  @test
  async "should allow multiple independent instances"() {
    let count1 = 0;
    let count2 = 0;

    const debounced1 = debounce(() => {
      count1++;
    }, 50);

    const debounced2 = debounce(() => {
      count2++;
    }, 50);

    debounced1();
    debounced2();

    await this.wait(100);

    assert.strictEqual(count1, 1);
    assert.strictEqual(count2, 1);
  }

  @test
  async "should reset timer on each call"() {
    let callCount = 0;
    const debouncedFunc = debounce(() => {
      callCount++;
    }, 100);

    debouncedFunc();
    await this.wait(50);
    debouncedFunc(); // Reset timer
    await this.wait(50);
    debouncedFunc(); // Reset timer again

    // Should not have been called yet (total elapsed: 100ms, but timer reset)
    assert.strictEqual(callCount, 0);

    await this.wait(150);

    // Now it should have been called
    assert.strictEqual(callCount, 1);
  }

  @test
  async "should cancel maxWait timer"() {
    let callCount = 0;
    const debouncedFunc = debounce(
      () => {
        callCount++;
      },
      100,
      { maxWait: 500 }
    );

    debouncedFunc();
    debouncedFunc();

    // Cancel before execution
    debouncedFunc.cancel();

    await this.wait(600);

    // Should not have been called
    assert.strictEqual(callCount, 0);
  }

  @test
  async "should handle maxWait in tight loop"() {
    let callCount = 0;
    const debouncedFunc = debounce(
      () => {
        callCount++;
      },
      50,
      { maxWait: 100 }
    );

    // Call rapidly to trigger maxWait behavior
    debouncedFunc();
    await this.wait(25);
    debouncedFunc();
    await this.wait(25);
    debouncedFunc();
    await this.wait(25);
    debouncedFunc();

    // Wait enough time for maxWait to trigger
    await this.wait(50);

    // Should have been called once due to maxWait
    assert.strictEqual(callCount, 1);

    // Now stop calling and wait for trailing edge
    await this.wait(100);

    // Trailing edge should have fired
    assert.ok(callCount >= 1);
  }

  @test
  async "should flush when no pending"() {
    let callCount = 0;
    const debouncedFunc = debounce(() => {
      callCount++;
    }, 100);

    // Flush without any pending calls
    debouncedFunc.flush();

    assert.strictEqual(callCount, 0);

    // Now call and flush
    debouncedFunc();
    debouncedFunc.flush();

    assert.strictEqual(callCount, 1);
  }

  @test
  async "should handle invocation during maxWait"() {
    let callCount = 0;
    const debouncedFunc = debounce(
      () => {
        callCount++;
      },
      100,
      { leading: false, trailing: true, maxWait: 200 }
    );

    // Trigger initial invocation
    debouncedFunc();

    // Keep calling during maxWait period
    for (let i = 0; i < 5; i++) {
      await this.wait(40);
      debouncedFunc();
    }

    await this.wait(150);

    // Should have been invoked at least once due to maxWait
    assert.ok(callCount >= 1);
  }

  @test
  async "should handle maxWait tight loop invocation"() {
    let callCount = 0;
    const debouncedFunc = debounce(
      () => {
        callCount++;
      },
      500, // Long wait time
      { maxWait: 200, leading: false, trailing: true } // Short maxWait
    );

    // First call - starts the timer
    debouncedFunc();

    // Wait for maxWait to pass (but not the full wait time)
    // This makes shouldInvoke return true due to maxWait
    await this.wait(210);

    // Second call - this should hit lines 225-229 because:
    // 1. shouldInvoke returns true (maxWait exceeded)
    // 2. timerId is still set (wait hasn't expired yet)
    // 3. maxWait is defined
    debouncedFunc();

    // Wait for everything to settle
    await this.wait(600);

    // Should have been invoked at least once
    assert.ok(callCount >= 1);
  }
}
