import { suite, test } from "@webda/test";
import * as assert from "assert";
import { CompiledAppTestBase } from "../test/compiled.js";

@suite
class AmbiguousTargetTest extends CompiledAppTestBase {
  /**
   * Two configured services of the class a compiled flow calls
   */
  paymentServices = ["Billing", "Refunds"];
  /**
   * Startup failure
   */
  startup?: Error;

  /**
   * Start, keeping the failure
   */
  async beforeAll() {
    try {
      await super.beforeAll();
    } catch (err) {
      this.startup = err as Error;
    }
  }

  /**
   * Nothing to reset: the application did not start
   */
  async beforeEach() {}

  @test
  ambiguousTargetFails() {
    assert.ok(this.startup, "the application must not start");
    assert.match(this.startup!.message, /OrderFlows\.Reconcile/);
    assert.match(this.startup!.message, /Billing/);
    assert.match(this.startup!.message, /Refunds/);
  }
}

@suite
class MissingTargetTest extends CompiledAppTestBase {
  /**
   * No configured service of the class a compiled flow calls
   */
  paymentServices: string[] = [];
  /**
   * Startup failure
   */
  startup?: Error;

  /**
   * Start, keeping the failure
   */
  async beforeAll() {
    try {
      await super.beforeAll();
    } catch (err) {
      this.startup = err as Error;
    }
  }

  /**
   * Nothing to reset: the application did not start
   */
  async beforeEach() {}

  @test
  missingTargetFails() {
    assert.ok(this.startup, "the application must not start");
    assert.match(this.startup!.message, /OrderFlows\.Reconcile/);
    assert.match(this.startup!.message, /PaymentService/);
  }
}
