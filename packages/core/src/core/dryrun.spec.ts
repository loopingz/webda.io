import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { TestApplication } from "../test/objects.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext } from "../contexts/httpcontext.js";
import {
  callOperation,
  registerOperation,
  registerOperationAuthorizer,
  unregisterOperationAuthorizer,
  isReadOnlyOperation,
  type DryRunResult
} from "./operations.js";
import { registerSchema, hasSchema } from "../schemas/hooks.js";
import { useApplication } from "../application/hooks.js";
import { useDryRun, runDryRun, runAsSystem } from "../contexts/execution.js";
import { useCoreEvents } from "../events/events.js";
import { AuditService } from "../services/audit.model.js";
import { useWorkerOutput, type WorkerMessage } from "@webda/workout";
import * as WebdaError from "../errors/errors.js";

/**
 * Service used for dry run testing
 */
class DryRunTargetService extends Service {
  called: Record<string, number> = {};
  lastArgs: Record<string, any[]> = {};
  delegateSawDry: boolean = false;
  delegateSawDryAfterAwait: boolean = false;

  static createConfiguration(params: any): ServiceParameters {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  reset() {
    this.called = {};
    this.lastArgs = {};
    this.delegateSawDry = false;
    this.delegateSawDryAfterAwait = false;
  }

  async deleteUser(ctx: OperationContext): Promise<void> {
    this.called["deleteUser"] = (this.called["deleteUser"] || 0) + 1;
    this.lastArgs["deleteUser"] = [ctx];
    ctx.write({ deleted: true });
  }

  async deleteWithArgs(uuid: string, payload: any): Promise<void> {
    this.called["deleteWithArgs"] = (this.called["deleteWithArgs"] || 0) + 1;
    this.lastArgs["deleteWithArgs"] = [uuid, payload];
  }

  async getUser(ctx: OperationContext): Promise<{ id: string; name: string }> {
    this.called["getUser"] = (this.called["getUser"] || 0) + 1;
    return { id: "123", name: "Alice" };
  }

  async checkHealth(): Promise<{ status: string }> {
    this.called["checkHealth"] = (this.called["checkHealth"] || 0) + 1;
    return { status: "ok" };
  }

  async migrate(): Promise<{ report: string }> {
    this.called["migrate"] = (this.called["migrate"] || 0) + 1;
    this.delegateSawDry = useDryRun();
    await new Promise(resolve => setTimeout(resolve, 5));
    this.delegateSawDryAfterAwait = useDryRun();
    return { report: "done" };
  }

  async parentOp(ctx: OperationContext): Promise<void> {
    this.called["parentOp"] = (this.called["parentOp"] || 0) + 1;
    await callOperation(ctx, "Health.Check");
  }
}

@suite
class DryRunTest extends WebdaApplicationTest {
  @test
  async createsAnIsolatedContextOutsideAnOperation() {
    await runAsSystem(async () => {
      assert.strictEqual(useDryRun(), false);
      await runDryRun(async () => {
        assert.strictEqual(useDryRun(), true);
        await Promise.resolve();
        assert.strictEqual(useDryRun(), true);
      });
      assert.strictEqual(useDryRun(), false);
    });
  }

  targetService!: DryRunTargetService;
  audits: AuditService[] = [];

  async afterEach(): Promise<void> {
    for (const audit of this.audits.splice(0)) {
      await audit.stop();
    }
    this.targetService?.reset();
    await super.afterEach();
  }

  getTestConfiguration() {
    return {
      parameters: {
        dryRun: {
          allowRequest: false
        }
      },
      services: {
        DryTarget: {
          type: "DryTarget"
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/DryTarget", DryRunTargetService);
    app.addModda("Webda/AuditService", AuditService);
  }

  async setupAudit(): Promise<AuditService> {
    const audit = this.registerService(new AuditService("AuditSvc", { operations: ["*"] } as any));
    this.audits.push(audit);
    audit.resolve();
    await audit.init();
    return audit;
  }

  registerOps() {
    const schema = {
      type: "object",
      properties: {
        uuid: { type: "string" },
        payload: {
          type: "object",
          properties: {
            password: { type: "string" },
            token: { type: "string" },
            secretData: { type: "string" },
            normalField: { type: "string" }
          }
        }
      },
      required: ["uuid"]
    };
    useApplication().getSchemas()["deleteWithArgsInput"] = schema as any;
    if (!hasSchema("deleteWithArgsInput")) {
      registerSchema("deleteWithArgsInput", schema);
    }

    const tryRegister = (id: string, opts: any) => {
      try {
        registerOperation(id, opts);
      } catch {
        // already registered
      }
    };

    tryRegister("User.Delete", {
      service: "DryTarget",
      method: "deleteUser",
      input: "void",
      output: "void",
      dryRun: "skip"
    });

    tryRegister("User.DeleteWithArgs", {
      service: "DryTarget",
      method: "deleteWithArgs",
      input: "deleteWithArgsInput",
      output: "void",
      dryRun: "skip"
    });

    tryRegister("User.Get", {
      service: "DryTarget",
      method: "getUser",
      input: "void",
      output: "void"
      // dryRun should default to "execute"
    });

    tryRegister("Health.Check", {
      service: "DryTarget",
      method: "checkHealth",
      input: "void",
      output: "void",
      dryRun: "execute"
    });

    tryRegister("System.Migrate", {
      service: "DryTarget",
      method: "migrate",
      input: "void",
      output: "void",
      dryRun: "delegate"
    });

    tryRegister("Parent.Call", {
      service: "DryTarget",
      method: "parentOp",
      input: "void",
      output: "void",
      dryRun: "delegate"
    });

    this.targetService = this.getService<DryRunTargetService>("DryTarget");
  }

  @test
  async isReadOnlyOperationHelper() {
    assert.strictEqual(isReadOnlyOperation("User.Get"), true);
    assert.strictEqual(isReadOnlyOperation("Users.Query"), true);
    assert.strictEqual(isReadOnlyOperation("User.Delete"), false);
    assert.strictEqual(isReadOnlyOperation("User.Create"), false);

    assert.strictEqual(isReadOnlyOperation("Custom.Op", { rest: { method: "get" } } as any), true);
    assert.strictEqual(isReadOnlyOperation("Custom.Op", { rest: { method: "GET" } } as any), true);
    assert.strictEqual(isReadOnlyOperation("Custom.Op", { rest: { method: "post" } } as any), false);

    assert.strictEqual(isReadOnlyOperation("User.Get", { mcp: { readOnly: false } } as any), false);
    assert.strictEqual(isReadOnlyOperation("User.Delete", { mcp: { readOnly: true } } as any), true);
  }

  @test
  async skipInDryContext() {
    this.registerOps();

    const dryEvents: any[] = [];
    const successEvents: any[] = [];
    const offDry = useCoreEvents("Webda.OperationDryRun", evt => dryEvents.push(evt));
    const offSuccess = useCoreEvents("Webda.OperationSuccess", evt => successEvents.push(evt));

    const messages: WorkerMessage[] = [];
    const logListener = (msg: WorkerMessage) => messages.push(msg);
    useWorkerOutput().on("message", logListener);

    try {
      const ctx = new OperationContext();
      await runDryRun(async () => {
        await callOperation(ctx, "User.Delete");
      }, ctx);

      // Method was not called
      assert.strictEqual(this.targetService.called["deleteUser"], undefined);

      // Context output is DryRunResult
      const output = JSON.parse(ctx.getOutput());
      assert.strictEqual(output.dryRun, true);
      assert.strictEqual(output.operationId, "User.Delete");
      assert.deepStrictEqual(output.arguments, []);

      // Webda.OperationDryRun emitted
      assert.strictEqual(dryEvents.length, 1);
      assert.strictEqual(dryEvents[0].operationId, "User.Delete");

      // Webda.OperationSuccess emitted with dryRun: true
      assert.strictEqual(successEvents.length, 1);
      assert.strictEqual(successEvents[0].dryRun, true);

      // INFO log contains DRY RUN User.Delete
      const dryLog = messages.find(
        m =>
          m.type === "log" &&
          m.log?.level === "INFO" &&
          m.log?.args?.some(part => String(part).includes("DRY RUN User.Delete"))
      );
      assert.ok(dryLog, "Expected an INFO log containing 'DRY RUN User.Delete'");
    } finally {
      offDry();
      offSuccess();
      useWorkerOutput().off("message", logListener);
    }
  }

  @test
  async secretMaskingInDryRun() {
    this.registerOps();

    const ctx = new OperationContext();
    ctx.setParameters({
      uuid: "user-1",
      payload: {
        password: "SuperSecretPassword123",
        token: "tok_secret_abc",
        secretData: "my-secret-value",
        normalField: "public-info"
      }
    });

    await runDryRun(async () => {
      await callOperation(ctx, "User.DeleteWithArgs");
    }, ctx);

    assert.strictEqual(this.targetService.called["deleteWithArgs"], undefined);

    const output: DryRunResult = JSON.parse(ctx.getOutput());
    assert.strictEqual(output.dryRun, true);
    assert.strictEqual(output.operationId, "User.DeleteWithArgs");

    const payloadArg = (output.arguments as any[])[1];
    assert.strictEqual(payloadArg.normalField, "public-info");
    assert.strictEqual(payloadArg.password, "********");
    assert.strictEqual(payloadArg.token, "********");
    assert.strictEqual(payloadArg.secretData, "********");
  }

  @test
  async executeDefaultRunsNormallyInDryContext() {
    this.registerOps();

    const successEvents: any[] = [];
    const off = useCoreEvents("Webda.OperationSuccess", evt => successEvents.push(evt));

    try {
      const ctx = new OperationContext();
      await runDryRun(async () => {
        await callOperation(ctx, "User.Get");
      }, ctx);

      // Method was executed
      assert.strictEqual(this.targetService.called["getUser"], 1);

      // Normal output
      const output = JSON.parse(ctx.getOutput());
      assert.strictEqual(output.name, "Alice");

      // Webda.OperationSuccess had dryRun: true
      assert.strictEqual(successEvents.length, 1);
      assert.strictEqual(successEvents[0].dryRun, true);
    } finally {
      off();
    }
  }

  @test
  async delegateOperationReadsUseDryRun() {
    this.registerOps();

    // Call normally (not dry)
    const normalCtx = new OperationContext();
    await callOperation(normalCtx, "System.Migrate");
    assert.strictEqual(this.targetService.called["migrate"], 1);
    assert.strictEqual(this.targetService.delegateSawDry, false);
    assert.strictEqual(this.targetService.delegateSawDryAfterAwait, false);

    // Call in dry mode
    this.targetService.reset();
    const dryCtx = new OperationContext();
    await runDryRun(async () => {
      await callOperation(dryCtx, "System.Migrate");
    }, dryCtx);

    assert.strictEqual(this.targetService.called["migrate"], 1);
    assert.strictEqual(this.targetService.delegateSawDry, true);
    assert.strictEqual(this.targetService.delegateSawDryAfterAwait, true);
  }

  @test
  async refusalsAndValidationThrownInDryMode() {
    this.registerOps();

    // Authorizer refusal
    const authorizer = async (_ctx: any, opId: string) => {
      if (opId === "User.Delete") return "ForbiddenByAuthorizer";
      return true;
    };
    registerOperationAuthorizer(authorizer);

    try {
      const ctx = new OperationContext();
      await assert.rejects(() => runDryRun(() => callOperation(ctx, "User.Delete"), ctx), WebdaError.Forbidden);
    } finally {
      unregisterOperationAuthorizer(authorizer);
    }

    // Schema validation failure
    const invalidCtx = new OperationContext();
    invalidCtx.setParameters({
      // missing required uuid
      payload: {}
    });

    await assert.rejects(
      () => runDryRun(() => callOperation(invalidCtx, "User.DeleteWithArgs"), invalidCtx),
      WebdaError.BadRequest
    );
  }

  @test
  async enforcePatternForcesDryRunAndWinsOverExclude() {
    this.registerOps();

    const config = useApplication().getConfiguration();
    config.parameters ??= {};
    config.parameters.dryRun = {
      enforce: ["User.Delete"],
      exclude: ["User.*"]
    };

    const ctx = new OperationContext();
    // No request flag passed!
    await callOperation(ctx, "User.Delete");

    // Enforce made it dry, exclude did NOT override enforce
    assert.strictEqual(this.targetService.called["deleteUser"], undefined);
    const output = JSON.parse(ctx.getOutput());
    assert.strictEqual(output.dryRun, true);
  }

  @test
  async enabledWithExcludeRunsExcludedNormally() {
    this.registerOps();

    const config = useApplication().getConfiguration();
    config.parameters ??= {};
    config.parameters.dryRun = {
      enabled: true,
      exclude: ["Health.*"]
    };

    // Health.Check is excluded, so it should run normally
    const healthCtx = new OperationContext();
    await callOperation(healthCtx, "Health.Check");
    assert.strictEqual(this.targetService.called["checkHealth"], 1);

    // User.Delete is NOT excluded, so enabled: true makes it dry
    const deleteCtx = new OperationContext();
    await callOperation(deleteCtx, "User.Delete");
    assert.strictEqual(this.targetService.called["deleteUser"], undefined);
    const output = JSON.parse(deleteCtx.getOutput());
    assert.strictEqual(output.dryRun, true);
  }

  @test
  async restHeaderRespectedOnlyWhenAllowed() {
    this.registerOps();

    const config = useApplication().getConfiguration();
    config.parameters ??= {};
    config.parameters.dryRun = {
      allowRequest: false
    };

    // Header sent, but allowRequest is false -> should NOT be dry
    const httpCtx1 = new HttpContext("localhost", "POST", "/users/123", "http", 80, {
      "x-webda-dry-run": "true"
    });
    const webCtx1 = new WebContext(httpCtx1);
    await callOperation(webCtx1, "User.Delete");
    assert.strictEqual(this.targetService.called["deleteUser"], 1);
    assert.strictEqual(webCtx1.getResponseHeaders()["X-Webda-Dry-Run"], undefined);

    // Turn allowRequest: true
    config.parameters.dryRun.allowRequest = true;
    this.targetService.reset();

    const httpCtx2 = new HttpContext("localhost", "POST", "/users/123", "http", 80, {
      "x-webda-dry-run": "true"
    });
    const webCtx2 = new WebContext(httpCtx2);
    await callOperation(webCtx2, "User.Delete");
    assert.strictEqual(this.targetService.called["deleteUser"], undefined);
    assert.strictEqual(webCtx2.getResponseHeaders()["X-Webda-Dry-Run"], "true");
  }

  @test
  async nestedOperationInheritsDryRun() {
    this.registerOps();

    // Even if Health.* is in exclude, if called from inside a dry operation, it stays dry!
    const config = useApplication().getConfiguration();
    config.parameters ??= {};
    config.parameters.dryRun = {
      exclude: ["Health.*"]
    };

    const ctx = new OperationContext();
    await runDryRun(async () => {
      await callOperation(ctx, "Parent.Call");
    }, ctx);

    assert.strictEqual(this.targetService.called["parentOp"], 1);
    // Nested Health.Check ran under a dry context, so it stayed dry!
    assert.strictEqual(ctx.getExtension("dryRun"), true);
  }

  @test
  async noAuditRecordWrittenForDryCall() {
    this.registerOps();
    const audit = await this.setupAudit();

    const ctx = new OperationContext();
    await runDryRun(async () => {
      await callOperation(ctx, "User.Delete");
    }, ctx);

    // User.Delete was skipped in dry mode
    assert.strictEqual(this.targetService.called["deleteUser"], undefined);

    // No audit entry was recorded
    assert.strictEqual(audit.getEntries().length, 0);
  }
}
