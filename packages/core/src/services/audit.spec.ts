

import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { TestApplication } from "../test/objects.js";
import { AuditEntry, AuditService, AuditServiceParameters } from "./audit.js";
import { callOperation, registerOperation } from "../core/operations.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";

/**
 * Minimal operation context that accepts a custom input buffer
 */
class SimpleOpContext extends OperationContext {
  private _input: Buffer = Buffer.from("");

  setInput(input: Buffer): this {
    this._input = input;
    return this;
  }

  async getRawInput(_limit: number = 1024 * 1024 * 10, _timeout: number = 60000): Promise<Buffer> {
    return this._input.subarray(0, _limit);
  }
}

/**
 * A small target service whose methods can be referenced by registerOperation
 */
class AuditTargetService extends Service {
  result: string = "";

  static createConfiguration(params: any): ServiceParameters {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  async doCreate(ctx: OperationContext): Promise<void> {
    this.result = "created";
    ctx.write("created");
  }

  async doGet(ctx: OperationContext): Promise<void> {
    this.result = "got";
    ctx.write("got");
  }

  async doFail(_ctx: OperationContext): Promise<void> {
    throw new Error("intentional failure");
  }
}

@suite
class AuditServiceTest extends WebdaApplicationTest {
  auditService: AuditService;

  getTestConfiguration() {
    return {
      services: {
        AuditTarget: {
          type: "AuditTarget"
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/AuditTarget", AuditTargetService);
    app.addModda("Webda/AuditService", AuditService);
  }

  /**
   * Create and register an AuditService with the given parameters
   */
  async setupAudit(params: Partial<AuditServiceParameters> = {}): Promise<AuditService> {
    // Pass raw params so that the application's createConfiguration (which processes
    // negation patterns like "!Other.Create") runs on the original input rather than
    // on a pre-loaded instance where excludedOperations has already been separated out.
    const audit = this.registerService(new AuditService("AuditSvc", params as any));
    audit.resolve();
    await audit.init();
    this.auditService = audit;
    return audit;
  }

  /**
   * Register the standard test operations. Guard against re-registration.
   */
  registerTestOps() {
    const tryRegister = (id: string, opts: any) => {
      try {
        registerOperation(id, opts);
      } catch {
        // Already registered in a previous test — that's fine
      }
    };
    tryRegister("Audit.Create", { service: "AuditTarget", method: "doCreate" });
    tryRegister("Audit.Get", { service: "AuditTarget", method: "doGet" });
    tryRegister("Audit.Fail", { service: "AuditTarget", method: "doFail" });
    tryRegister("Other.Create", { service: "AuditTarget", method: "doCreate" });
    tryRegister("Other.Get", { service: "AuditTarget", method: "doGet" });
  }

  /**
   * Run a single operation, swallowing expected errors
   */
  async runOp(operationId: string, expectFailure: boolean = false): Promise<void> {
    const ctx = new SimpleOpContext();
    await ctx.init();
    if (expectFailure) {
      try {
        await callOperation(ctx, operationId);
      } catch {
        // expected failure
      }
    } else {
      await callOperation(ctx, operationId);
    }
  }

  @test
  async capturesOperationSuccess() {
    this.registerTestOps();
    const audit = await this.setupAudit();

    await this.runOp("Audit.Create");

    const entries = audit.getEntries();
    assert.strictEqual(entries.length, 1);
    assert.ok(entries[0] instanceof AuditEntry, "entry should be an AuditEntry model instance");
    assert.strictEqual(entries[0].operationId, "Audit.Create");
    assert.strictEqual(entries[0].success, true);
    assert.strictEqual(entries[0].error, undefined);
    assert.ok(entries[0].timestamp instanceof Date);
  }

  @test
  async capturesOperationFailure() {
    this.registerTestOps();
    const audit = await this.setupAudit();

    await this.runOp("Audit.Fail", true);

    const entries = audit.getEntries();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].operationId, "Audit.Fail");
    assert.strictEqual(entries[0].success, false);
    assert.ok(entries[0].error?.includes("intentional failure"));
  }

  @test
  async filtersOperations() {
    this.registerTestOps();
    const audit = await this.setupAudit({ operations: ["Audit.*"] });

    await this.runOp("Audit.Create");
    await this.runOp("Other.Create");

    const entries = audit.getEntries();
    assert.strictEqual(entries.length, 1, "should only capture Audit.* operations");
    assert.strictEqual(entries[0].operationId, "Audit.Create");
  }

  @test
  async levelFilterWrite() {
    this.registerTestOps();
    const audit = await this.setupAudit({ level: "write" });

    await this.runOp("Audit.Get");
    await this.runOp("Audit.Create");

    const entries = audit.getEntries();
    assert.strictEqual(entries.length, 1, "should only capture write operations");
    assert.strictEqual(entries[0].operationId, "Audit.Create");
  }

  @test
  async levelFilterFailure() {
    this.registerTestOps();
    const audit = await this.setupAudit({ level: "failure" });

    // Success — should NOT be captured
    await this.runOp("Audit.Create");
    // Failure — SHOULD be captured
    await this.runOp("Audit.Fail", true);

    const entries = audit.getEntries();
    assert.strictEqual(entries.length, 1, "should only capture failed operations");
    assert.strictEqual(entries[0].operationId, "Audit.Fail");
    assert.strictEqual(entries[0].success, false);
  }

  @test
  async excludeWithNegation() {
    this.registerTestOps();
    const audit = await this.setupAudit({ operations: ["*", "!Other.Create"] });

    await this.runOp("Audit.Create");
    await this.runOp("Other.Create");

    const entries = audit.getEntries();
    const ids = entries.map(e => e.operationId);
    assert.ok(ids.includes("Audit.Create"), "Audit.Create should be captured");
    assert.ok(!ids.includes("Other.Create"), "Other.Create should be excluded");
  }

  @test
  async parametersIsIncluded() {
    // Unit tests for AuditServiceParameters.isIncluded
    const p1 = new AuditServiceParameters().load({});
    assert.ok(p1.isIncluded("Anything.Here"), "wildcard should include everything");

    const p2 = new AuditServiceParameters().load({ operations: ["Audit.Create"] });
    assert.ok(p2.isIncluded("Audit.Create"));
    assert.ok(!p2.isIncluded("Audit.Get"));

    const p3 = new AuditServiceParameters().load({ operations: ["Audit.*"] });
    assert.ok(p3.isIncluded("Audit.Create"));
    assert.ok(!p3.isIncluded("Other.Create"));

    const p4 = new AuditServiceParameters().load({ operations: ["!Audit.Delete"] });
    assert.ok(p4.isIncluded("Audit.Create"), "exclude-only adds wildcard");
    assert.ok(!p4.isIncluded("Audit.Delete"));

    const p5 = new AuditServiceParameters().load({ operations: ["*", "!Audit.Delete"] });
    assert.ok(p5.isIncluded("Audit.Create"));
    assert.ok(!p5.isIncluded("Audit.Delete"));
  }

  @test
  async shouldAuditLevels() {
    // level: "all"
    const allAudit = new AuditService("a1", new AuditServiceParameters().load({ level: "all" }));
    assert.ok(allAudit.shouldAudit("Audit.Get", true));
    assert.ok(allAudit.shouldAudit("Audit.Get", false));
    assert.ok(allAudit.shouldAudit("Audit.Create", true));

    // level: "write"
    const writeAudit = new AuditService("a2", new AuditServiceParameters().load({ level: "write" }));
    assert.ok(writeAudit.shouldAudit("Audit.Create", true));
    assert.ok(writeAudit.shouldAudit("Audit.Delete", true));
    assert.ok(writeAudit.shouldAudit("Audit.Update", true));
    assert.ok(writeAudit.shouldAudit("Audit.Patch", true));
    assert.ok(!writeAudit.shouldAudit("Audit.Get", true));
    assert.ok(!writeAudit.shouldAudit("Audit.Query", true));

    // level: "failure"
    const failAudit = new AuditService("a3", new AuditServiceParameters().load({ level: "failure" }));
    assert.ok(failAudit.shouldAudit("Audit.Create", false));
    assert.ok(!failAudit.shouldAudit("Audit.Create", true));

    // filter excludes operation regardless of level
    const filteredAudit = new AuditService(
      "a4",
      new AuditServiceParameters().load({ operations: ["Audit.*"], level: "all" })
    );
    assert.ok(!filteredAudit.shouldAudit("Other.Create", true));
    assert.ok(filteredAudit.shouldAudit("Audit.Create", true));
  }

  @test
  async staticMethods() {
    // Cover createConfiguration and filterParameters static methods
    const params = AuditService.createConfiguration({ level: "write", operations: ["Audit.*"] });
    assert.ok(params instanceof AuditServiceParameters);
    assert.strictEqual(params.level, "write");

    // filterParameters is a passthrough; schema-based filtering is handled by the module loader
    const filtered = AuditService.filterParameters({ level: "write", foo: "bar" });
    assert.strictEqual(filtered.level, "write");
  }

  @test
  async persistsToStore() {
    this.registerTestOps();

    // Create a mock store with a tracked create method
    const savedEntries: any[] = [];
    const mockStore = {
      create: async (_uuid: any, entry: any) => {
        savedEntries.push(entry);
      }
    };

    const svcParams = new AuditServiceParameters().load({});
    const audit = this.registerService(new AuditService("AuditSvcStore", svcParams));
    audit.resolve();
    await audit.init();
    // Inject the mock store after resolve (so the Injector doesn't overwrite it)
    (audit as any).auditStore = mockStore;

    await this.runOp("Audit.Create");

    // The in-memory list should also have it
    const entries = audit.getEntries();
    assert.strictEqual(entries.length, 1);
    // The store should have received the save call
    assert.strictEqual(savedEntries.length, 1);
    assert.strictEqual(savedEntries[0].operationId, "Audit.Create");
    assert.strictEqual(savedEntries[0].success, true);
  }
}
