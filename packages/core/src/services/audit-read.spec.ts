import { suite, test } from "@webda/test";
import * as assert from "assert";
import { escape } from "@webda/ql";
import { WebdaApplicationTest } from "../test/index.js";
import { TestApplication } from "../test/objects.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";
import { useModel } from "../application/hooks.js";
import { callOperation, registerOperation } from "../core/operations.js";
import { AuditEntry, AuditService, AuditServiceParameters } from "./audit.model.js";

/**
 * Operation context with a JSON body
 */
class JsonOpContext extends OperationContext {
  protected body: string;

  constructor(body: any = undefined) {
    super();
    this.body = body === undefined ? "" : JSON.stringify(body);
  }

  async getRawInputAsString(): Promise<string> {
    return this.body;
  }

  async getRawInput(): Promise<Buffer> {
    return Buffer.from(this.body);
  }
}

/**
 * Target service for recording tests
 */
class RecordTargetService extends Service {
  static createConfiguration(params: any): ServiceParameters {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  async touch(): Promise<string> {
    return "touched";
  }

  async fail(): Promise<void> {
    throw new Error("touch failed");
  }
}

let counter = 0;

@suite
class AuditReadTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { services: { RecordTarget: { type: "RecordTarget" } } };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/RecordTarget", RecordTargetService);
    app.addModda("Webda/AuditService", AuditService);
  }

  /** Unique id so tests sharing the memory store stay isolated */
  unique(prefix: string): string {
    return `${prefix}-${Date.now()}-${counter++}`;
  }

  async setupAudit(params: Partial<AuditServiceParameters> = {}): Promise<AuditService> {
    const audit = this.registerService(new AuditService(this.unique("AuditRead"), params as any));
    audit.resolve();
    await audit.init();
    return audit;
  }

  registerRecordOps() {
    const User: any = useModel("Webda/User");
    for (const [id, method] of [
      ["AuditRec.Touch", "touch"],
      ["AuditRec.Fail", "fail"]
    ]) {
      try {
        registerOperation(id, {
          service: "RecordTarget",
          method,
          context: { model: User, pkFields: ["uuid"] }
        });
      } catch {
        // Already registered by a previous test
      }
    }
  }

  /** Call an operation with a JSON body, optionally logged in */
  async call(operationId: string, body: any, user?: { id: string; roles?: string[] }): Promise<any> {
    const ctx = new JsonOpContext(body);
    const session = ctx.newSession();
    if (user) {
      session.login(user.id, "test");
      session.roles = user.roles ?? [];
    }
    await callOperation(ctx, operationId);
    return JSON.parse(ctx.getOutput());
  }

  /** Save an audit entry directly */
  async seed(fields: Partial<AuditEntry>, at: Date = new Date()): Promise<AuditEntry> {
    const entry = new AuditEntry();
    entry.operationId = "Seed.Op";
    entry.success = true;
    entry.timestamp = at;
    Object.assign(entry, fields);
    await entry.save();
    return entry;
  }

  @test
  async recordsSubjectOnSuccessAndFailure() {
    this.registerRecordOps();
    const audit = await this.setupAudit({ operations: ["AuditRec.*"] });
    const okKey = this.unique("u");
    const failKey = this.unique("u");

    const ok = new JsonOpContext();
    ok.setParameters({ uuid: okKey });
    await callOperation(ok, "AuditRec.Touch");
    const ko = new JsonOpContext();
    ko.setParameters({ uuid: failKey });
    await assert.rejects(() => callOperation(ko, "AuditRec.Fail"), /touch failed/);

    const touched = audit.getEntries().find(e => e.subjectKey === okKey);
    assert.ok(touched, "the successful operation is recorded with its subject");
    assert.strictEqual(touched.subjectModel, "Webda/User");
    assert.strictEqual(touched.success, true);
    const failed = audit.getEntries().find(e => e.subjectKey === failKey);
    assert.ok(failed, "the failed operation is recorded with its subject");
    assert.strictEqual(failed.success, false);
    assert.strictEqual(failed.error, "touch failed");

    // Persisted through the AuditEntry repository. AuditService instances created by
    // earlier tests in this file still listen to the global events, so count >= 1.
    const stored = await AuditEntry.query(escape(["subjectKey = ", ""], [okKey]));
    assert.ok(stored.results.length >= 1);
    assert.ok(stored.results.every(e => e.subjectModel === "Webda/User"));
  }

  @test
  async auditReadsFollowTheLevel() {
    const write = await this.setupAudit({ level: "write" });
    assert.strictEqual(write.shouldAudit("Audit.Subject", true), false);
    assert.strictEqual(write.shouldAudit("Audit.Actor", true), false);
    assert.strictEqual(write.shouldAudit("Audit.Query", true), false);
    // Other Audit.* operations are not reads
    assert.strictEqual(write.shouldAudit("Audit.Create", true), true);
    const all = await this.setupAudit({ level: "all" });
    assert.strictEqual(all.shouldAudit("Audit.Subject", true), true);
    assert.strictEqual(all.shouldAudit("Audit.Actor", true), true);
  }
}
