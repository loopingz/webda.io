import { suite, test } from "@webda/test";
import * as assert from "assert";
import { CronService, listOperations, Operation, Service } from "@webda/core";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
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
   * No configured service of the class a compiled flow calls (a packaged unit without it)
   */
  paymentServices: string[] = [];

  @test
  async missingTargetDropsTheFlowOnly() {
    // The application started: only the flow that cannot run is left out
    assert.strictEqual(listOperations()["OrderFlows.Reconcile"], undefined);
    assert.strictEqual(this.service.getFlow("OrderFlows.Reconcile"), undefined);
    assert.deepStrictEqual(
      CronService.resolveCrons().filter(c => c.operationId === "OrderFlows.Reconcile"),
      []
    );
    const uuid = await this.launch({ id: "OrderFlows.Archive" } as any, { since: 3 }, "alice");
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output, 3);
  }
}

/**
 * A service whose operation id is the one of a compiled flow
 */
export class ClashService extends Service {
  /**
   * @returns nothing
   */
  @Operation({ id: "OrderFlows.Archive" })
  async archive() {
    return 1;
  }
}

/**
 * Startup with an operation named like a compiled flow
 */
class ClashTestBase extends CompiledAppTestBase {
  /**
   * Configure the clashing service first
   */
  clashFirst = true;
  /**
   * Startup failure
   */
  startup?: Error;

  /**
   * @override
   * @returns the configuration
   */
  getTestConfiguration(): any {
    const config = super.getTestConfiguration();
    const { WorkflowService, ...others } = config.services;
    config.services = this.clashFirst
      ? { Clash: { type: "FlowApp/ClashService" }, WorkflowService, ...others }
      : { WorkflowService, ...others, Clash: { type: "FlowApp/ClashService" } };
    return config;
  }

  /**
   * Add the clashing service
   * @param app - the test application
   */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.addModda("FlowApp/ClashService", ClashService);
  }

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
}

@suite
class ClashBeforeTest extends ClashTestBase {
  @test
  operationRegisteredBeforeFails() {
    assert.ok(this.startup, "the application must not start");
    // Refused when the flow registers
    assert.match(this.startup!.stack ?? "", /registerModuleFlows/);
    assert.match(this.startup!.message, /OrderFlows\.Archive/);
    assert.match(this.startup!.message, /Clash/);
  }
}

@suite
class ClashAfterTest extends ClashTestBase {
  clashFirst = false;

  @test
  operationRegisteredAfterFails() {
    assert.ok(this.startup, "the application must not start");
    // Noticed once every service registered its operations
    assert.match(this.startup!.stack ?? "", /resolveModuleTargets/);
    assert.match(this.startup!.message, /OrderFlows\.Archive/);
    assert.match(this.startup!.message, /Clash/);
  }
}
