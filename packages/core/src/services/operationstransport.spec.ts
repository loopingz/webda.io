
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { OperationDefinition } from "../core/icore.js";
import { OperationsTransport, OperationsTransportParameters } from "./operationstransport.js";
import { registerOperation } from "../core/operations.js";
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";

/**
 * Concrete test transport that collects all exposed operations
 */
class TestTransport extends OperationsTransport {
  exposed: { id: string; definition: OperationDefinition }[] = [];

  static createConfiguration(params: any): OperationsTransportParameters {
    return new OperationsTransportParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  exposeOperation(operationId: string, definition: OperationDefinition): void {
    this.exposed.push({ id: operationId, definition });
  }
}

/**
 * A simple helper service whose methods can be referenced by registerOperation
 */
class DummyService extends Service {
  static createConfiguration(params: any): ServiceParameters {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  async doSomething(): Promise<void> {}
}

@suite
class OperationsTransportTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    // Remove beans so nothing auto-registers
    core.getBeans = () => {};
    core.registerBeans = () => {};
    return core;
  }

  @test
  async exposesAllOperations() {
    // Register a DummyService into the core
    const dummy = this.registerService(new DummyService("DummyAll", new ServiceParameters().load({})));
    await dummy.resolve();

    // Register two visible operations
    registerOperation("Transport.OpA", { service: "DummyAll", method: "doSomething" });
    registerOperation("Transport.OpB", { service: "DummyAll", method: "doSomething" });

    const transport = this.registerService(new TestTransport("testTransport", new OperationsTransportParameters().load({})));
    await transport.resolve();
    await transport.init();

    const exposedIds = transport.exposed.map(e => e.id);
    assert.ok(exposedIds.includes("Transport.OpA"), "Transport.OpA should be exposed");
    assert.ok(exposedIds.includes("Transport.OpB"), "Transport.OpB should be exposed");
  }

  @test
  async filtersOperations() {
    const dummy = this.registerService(new DummyService("DummyFilter", new ServiceParameters().load({})));
    await dummy.resolve();

    registerOperation("User.Create", { service: "DummyFilter", method: "doSomething" });
    registerOperation("Users.Query", { service: "DummyFilter", method: "doSomething" });
    registerOperation("Other.Op", { service: "DummyFilter", method: "doSomething" });

    const transport = this.registerService(
      new TestTransport("filterTransport", new OperationsTransportParameters().load({ operations: ["User.*", "Users.*"] }))
    );
    await transport.resolve();
    await transport.init();

    const exposedIds = transport.exposed.map(e => e.id);
    assert.ok(exposedIds.includes("User.Create"), "User.Create should be exposed");
    assert.ok(exposedIds.includes("Users.Query"), "Users.Query should be exposed");
    assert.ok(!exposedIds.includes("Other.Op"), "Other.Op should NOT be exposed");
  }

  @test
  async excludesOperations() {
    const dummy = this.registerService(new DummyService("DummyExclude", new ServiceParameters().load({})));
    await dummy.resolve();

    registerOperation("UserExcl.Create", { service: "DummyExclude", method: "doSomething" });
    registerOperation("UserExcl.Delete", { service: "DummyExclude", method: "doSomething" });

    const transport = this.registerService(
      new TestTransport("excludeTransport", new OperationsTransportParameters().load({ operations: ["*", "!UserExcl.Delete"] }))
    );
    await transport.resolve();
    await transport.init();

    const exposedIds = transport.exposed.map(e => e.id);
    assert.ok(exposedIds.includes("UserExcl.Create"), "UserExcl.Create should be exposed");
    assert.ok(!exposedIds.includes("UserExcl.Delete"), "UserExcl.Delete should NOT be exposed");
  }

  @test
  async skipsHiddenOperations() {
    const dummy = this.registerService(new DummyService("DummyHidden", new ServiceParameters().load({})));
    await dummy.resolve();

    registerOperation("Hidden.Visible", { service: "DummyHidden", method: "doSomething" });
    registerOperation("Hidden.Secret", { service: "DummyHidden", method: "doSomething", hidden: true });

    const transport = this.registerService(
      new TestTransport("hiddenTransport", new OperationsTransportParameters().load({}))
    );
    await transport.resolve();
    await transport.init();

    const exposedIds = transport.exposed.map(e => e.id);
    assert.ok(exposedIds.includes("Hidden.Visible"), "Hidden.Visible should be exposed");
    assert.ok(!exposedIds.includes("Hidden.Secret"), "Hidden.Secret should NOT be exposed (hidden)");
  }

  @test
  async parametersIsIncluded() {
    // Direct unit test of OperationsTransportParameters.isIncluded

    // Wildcard include
    const p1 = new OperationsTransportParameters().load({});
    assert.ok(p1.isIncluded("Anything.Here"), "wildcard should include everything");
    assert.ok(p1.isIncluded("User.Delete"), "wildcard should include User.Delete");

    // Explicit include
    const p2 = new OperationsTransportParameters().load({ operations: ["User.Create"] });
    assert.ok(p2.isIncluded("User.Create"), "explicit include should include User.Create");
    assert.ok(!p2.isIncluded("User.Delete"), "explicit include should NOT include User.Delete");

    // Prefix wildcard
    const p3 = new OperationsTransportParameters().load({ operations: ["User.*"] });
    assert.ok(p3.isIncluded("User.Create"), "prefix wildcard should include User.Create");
    assert.ok(p3.isIncluded("User.Delete"), "prefix wildcard should include User.Delete");
    assert.ok(!p3.isIncluded("Other.Op"), "prefix wildcard should NOT include Other.Op");

    // Exclude only (implicitly adds wildcard)
    const p4 = new OperationsTransportParameters().load({ operations: ["!User.Delete"] });
    assert.ok(p4.isIncluded("User.Create"), "exclude-only should include User.Create");
    assert.ok(!p4.isIncluded("User.Delete"), "exclude-only should NOT include User.Delete");

    // Wildcard with negation
    const p5 = new OperationsTransportParameters().load({ operations: ["*", "!User.Delete"] });
    assert.ok(p5.isIncluded("User.Create"), "wildcard+negation should include User.Create");
    assert.ok(!p5.isIncluded("User.Delete"), "wildcard+negation should NOT include User.Delete");
  }

  @test
  async getOperationsFiltered() {
    const dummy = this.registerService(new DummyService("DummyGetOps", new ServiceParameters().load({})));
    await dummy.resolve();

    registerOperation("GetOps.Alpha", { service: "DummyGetOps", method: "doSomething" });
    registerOperation("GetOps.Beta", { service: "DummyGetOps", method: "doSomething" });

    const transport = this.registerService(
      new TestTransport("getOpsTransport", new OperationsTransportParameters().load({ operations: ["GetOps.Alpha"] }))
    );
    await transport.resolve();

    const ops = transport.getOperations();
    assert.ok(ops["GetOps.Alpha"], "GetOps.Alpha should be in getOperations()");
    assert.ok(!ops["GetOps.Beta"], "GetOps.Beta should NOT be in getOperations()");
  }
}
