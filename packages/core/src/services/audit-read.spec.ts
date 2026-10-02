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
import * as WebdaError from "../errors/errors.js";
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

  /** Create a core User the caller can log in as */
  async user(uuid: string = this.unique("user")): Promise<string> {
    const User: any = useModel("Webda/User");
    await User.create({ uuid });
    return uuid;
  }

  isError(type: any) {
    return (err: any) => err instanceof type;
  }

  @test
  async subjectAllowedByCanAct() {
    await this.setupAudit({ level: "write" });
    const alice = await this.user();
    await this.seed({ subjectModel: "Webda/User", subjectKey: alice, operationId: "User.Update" });
    await this.seed({ subjectModel: "Webda/User", subjectKey: alice, operationId: "User.Patch" });
    const res = await this.call("Audit.Subject", { model: "Webda/User", key: alice }, { id: alice });
    assert.deepStrictEqual(res.results.map((e: any) => e.operationId).sort(), ["User.Patch", "User.Update"]);
  }

  @test
  async subjectDeniedByCanAct() {
    await this.setupAudit({ level: "write" });
    const alice = await this.user();
    const bob = await this.user();
    await assert.rejects(
      () => this.call("Audit.Subject", { model: "Webda/User", key: alice }, { id: bob }),
      this.isError(WebdaError.Forbidden)
    );
  }

  @test
  async subjectWithoutCanActIsDenied() {
    await this.setupAudit({ level: "write" });
    // AuditEntry (a CoreModel) defines no canAct
    const target = await this.seed({ operationId: "Some.Op" });
    await assert.rejects(
      () => this.call("Audit.Subject", { model: "Webda/AuditEntry", key: target.getUUID() }, { id: "anyone" }),
      this.isError(WebdaError.Forbidden)
    );
  }

  @test
  async missingSubjectNeedsReadPermission() {
    await this.setupAudit({ level: "write", readPermission: "roles CONTAINS 'admin'" });
    const ghost = this.unique("ghost");
    await this.seed({ subjectModel: "Webda/User", subjectKey: ghost, operationId: "User.Delete" });
    await assert.rejects(
      () => this.call("Audit.Subject", { model: "Webda/User", key: ghost }, { id: "someone" }),
      this.isError(WebdaError.NotFound)
    );
    const res = await this.call(
      "Audit.Subject",
      { model: "Webda/User", key: ghost },
      { id: "admin", roles: ["admin"] }
    );
    assert.deepStrictEqual(
      res.results.map((e: any) => e.operationId),
      ["User.Delete"]
    );
  }

  @test
  async unknownModel() {
    await this.setupAudit({ level: "write", readPermission: "roles CONTAINS 'admin'" });
    await assert.rejects(
      () => this.call("Audit.Subject", { model: "Webda/Nope", key: "x" }, { id: "admin", roles: ["admin"] }),
      this.isError(WebdaError.NotFound)
    );
  }

  @test
  async invalidKey() {
    await this.setupAudit({ level: "write" });
    await assert.rejects(
      () => this.call("Audit.Subject", { model: "Webda/User", key: "" }, { id: "someone" }),
      this.isError(WebdaError.BadRequest)
    );
  }

  @test
  async quotedKey() {
    await this.setupAudit({ level: "write" });
    const obrien = await this.user(this.unique("o'brien"));
    await this.seed({ subjectModel: "Webda/User", subjectKey: obrien, operationId: "User.Update" });
    const res = await this.call("Audit.Subject", { model: "Webda/User", key: obrien }, { id: obrien });
    assert.strictEqual(res.results.length, 1);
  }

  @test
  async actorReads() {
    await this.setupAudit({ level: "write", readPermission: "roles CONTAINS 'admin'" });
    const alice = this.unique("actor");
    await this.seed({ userId: alice, operationId: "Post.Create" });
    // Own activity
    const own = await this.call("Audit.Actor", {}, { id: alice });
    assert.deepStrictEqual(
      own.results.map((e: any) => e.operationId),
      ["Post.Create"]
    );
    // Someone else's activity needs readPermission
    await assert.rejects(
      () => this.call("Audit.Actor", { userId: alice }, { id: "bob" }),
      this.isError(WebdaError.Forbidden)
    );
    const asAdmin = await this.call("Audit.Actor", { userId: alice }, { id: "root", roles: ["admin"] });
    // Listeners left by earlier tests at level "all" may also have recorded alice's Audit.Actor read
    assert.ok(asAdmin.results.some((e: any) => e.operationId === "Post.Create"));
    // Anonymous callers have no activity of their own to read
    await assert.rejects(() => this.call("Audit.Actor", {}), this.isError(WebdaError.Forbidden));
  }

  @test
  async queryRequiresPermission() {
    await this.setupAudit({ level: "write", readPermission: "roles CONTAINS 'admin'" });
    const op = `Seed.${this.unique("Q").replace(/[^A-Za-z0-9]/g, "")}`;
    await this.seed({ operationId: op });
    await assert.rejects(
      () => this.call("Audit.Query", { q: `operationId = '${op}'` }, { id: "bob" }),
      this.isError(WebdaError.Forbidden)
    );
    const res = await this.call("Audit.Query", { q: `operationId = '${op}'` }, { id: "root", roles: ["admin"] });
    assert.strictEqual(res.results.length, 1);
    await assert.rejects(
      () => this.call("Audit.Query", { q: "operationId = = 'x'" }, { id: "root", roles: ["admin"] }),
      this.isError(WebdaError.BadRequest)
    );
  }

  @test
  async newestFirstAndPaginated() {
    await this.setupAudit({ level: "write" });
    const alice = await this.user();
    const start = Date.now();
    for (let i = 0; i < 3; i++) {
      await this.seed(
        { subjectModel: "Webda/User", subjectKey: alice, operationId: `User.Step${i}` },
        new Date(start + i * 1000)
      );
    }
    const page1 = await this.call("Audit.Subject", { model: "Webda/User", key: alice, limit: 2 }, { id: alice });
    assert.deepStrictEqual(
      page1.results.map((e: any) => e.operationId),
      ["User.Step2", "User.Step1"]
    );
    assert.ok(page1.continuationToken, "a second page is announced");
    const page2 = await this.call(
      "Audit.Subject",
      { model: "Webda/User", key: alice, limit: 2, continuationToken: page1.continuationToken },
      { id: alice }
    );
    assert.deepStrictEqual(
      page2.results.map((e: any) => e.operationId),
      ["User.Step0"]
    );
  }

  @test
  async limitIsClamped() {
    await this.setupAudit({ level: "write" });
    const alice = await this.user();
    await this.seed({ subjectModel: "Webda/User", subjectKey: alice });
    await this.seed({ subjectModel: "Webda/User", subjectKey: alice });
    const res = await this.call("Audit.Subject", { model: "Webda/User", key: alice, limit: -5 }, { id: alice });
    assert.strictEqual(res.results.length, 1, "a negative limit becomes 1");
    const big = await this.call("Audit.Subject", { model: "Webda/User", key: alice, limit: 100000 }, { id: alice });
    assert.strictEqual(big.results.length, 2);
  }
}
