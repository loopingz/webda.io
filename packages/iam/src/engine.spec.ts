import { suite, test } from "@webda/test";
import * as assert from "assert";
import { compileAttachments, compilePolicies, PolicyDocument } from "./compiler.js";
import { IAMRequestContext, PolicyEngine } from "./engine.js";

const policies: PolicyDocument[] = [
  {
    name: "TaskEditor",
    statements: [
      { effect: "allow", operations: ["Tasks.*"], condition: "r.ctx.input.status != 'archived'" },
      { effect: "deny", operations: ["Tasks.Delete"] }
    ]
  },
  { name: "ReadAll", statements: [{ effect: "allow", operations: ["*.Get", "*.Query"] }] },
  { name: "Everything", statements: [{ effect: "allow", operations: ["*"] }] },
  { name: "NoBigRefund", statements: [{ effect: "deny", operations: ["Billing.Refund"], condition: "r.ctx.input.amount > 1000" }] },
  {
    name: "OwnOnly",
    statements: [{ effect: "allow", operations: ["Notes.Edit"], condition: "r.ctx.input.meta.owner == r.ctx.user.uuid" }]
  },
  { name: "Office", statements: [{ effect: "allow", operations: ["Office.*"], condition: "includes(r.ctx.user.groups, 'staff') && ipMatch(r.ctx.http.ip, '10.0.0.0/8')" }] }
];

const ctx = (operationId: string, extra: Partial<IAMRequestContext> = {}): IAMRequestContext => ({
  operationId,
  probe: false,
  input: {},
  now: Date.now(),
  ...extra
});

@suite
class EngineTest {
  engine: PolicyEngine;

  async beforeEach() {
    const { rows } = compileAttachments(
      [
        { principal: "group:editors", policy: "TaskEditor" },
        { principal: "authenticated", policy: "ReadAll" },
        { principal: "user:root", policy: "Everything" },
        { principal: "user:root", policy: "NoBigRefund" },
        { principal: "group:writers", policy: "OwnOnly" },
        { principal: "group:staff", policy: "Office" }
      ],
      new Set(policies.map(p => p.name))
    );
    this.engine = await PolicyEngine.build(compilePolicies(policies), rows);
  }

  @test
  async implicitDeny() {
    assert.notStrictEqual(await this.engine.decide(["anonymous"], "Tasks.Update", ctx("Tasks.Update")), true);
    assert.match(String(await this.engine.decide(["anonymous"], "Tasks.Update", ctx("Tasks.Update"))), /implicit deny/);
  }

  @test
  async conditionsOnInput() {
    const editor = ["user:u1", "group:editors", "authenticated"];
    assert.strictEqual(await this.engine.decide(editor, "Tasks.Update", ctx("Tasks.Update", { input: { status: "draft" } })), true);
    assert.notStrictEqual(
      await this.engine.decide(editor, "Tasks.Update", ctx("Tasks.Update", { input: { status: "archived" } })),
      true
    );
  }

  @test
  async denyWins() {
    const editor = ["user:u1", "group:editors", "authenticated"];
    assert.notStrictEqual(await this.engine.decide(editor, "Tasks.Delete", ctx("Tasks.Delete")), true);
    const root = ["user:root", "authenticated"];
    assert.strictEqual(await this.engine.decide(root, "Billing.Refund", ctx("Billing.Refund", { input: { amount: 10 } })), true);
    assert.notStrictEqual(
      await this.engine.decide(root, "Billing.Refund", ctx("Billing.Refund", { input: { amount: 5000 } })),
      true
    );
  }

  @test
  async globBoundaries() {
    const editor = ["user:u1", "group:editors"];
    assert.notStrictEqual(await this.engine.decide(editor, "TasksAdmin.Get", ctx("TasksAdmin.Get", { input: { status: "x" } })), true);
    const reader = ["user:u2", "authenticated"];
    assert.strictEqual(await this.engine.decide(reader, "Anything.Get", ctx("Anything.Get")), true);
    assert.notStrictEqual(await this.engine.decide(reader, "Anything.Getter", ctx("Anything.Getter")), true);
    assert.strictEqual(await this.engine.decide(["user:root"], "Whatever.Op", ctx("Whatever.Op")), true);
  }

  @test
  async userAndHttpConditions() {
    const writer = ["user:w1", "group:writers"];
    const user = { uuid: "w1", groups: ["writers"], roles: [] };
    assert.strictEqual(
      await this.engine.decide(writer, "Notes.Edit", ctx("Notes.Edit", { user, input: { meta: { owner: "w1" } } })),
      true
    );
    assert.notStrictEqual(
      await this.engine.decide(writer, "Notes.Edit", ctx("Notes.Edit", { user, input: { meta: { owner: "x" } } })),
      true
    );
    const staff = { uuid: "s1", groups: ["staff"], roles: [] };
    const http = { method: "POST", ip: "10.1.2.3", host: "h" };
    assert.strictEqual(await this.engine.decide(["user:s1", "group:staff"], "Office.Open", ctx("Office.Open", { user: staff, http })), true);
    assert.notStrictEqual(
      await this.engine.decide(["user:s1", "group:staff"], "Office.Open", ctx("Office.Open", { user: staff, http: { ...http, ip: "8.8.8.8" } })),
      true
    );
  }

  @test
  async conditionErrorIsARefusal() {
    const writer = ["user:w1", "group:writers"];
    const user = { uuid: "w1", groups: ["writers"], roles: [] };
    // r.ctx.input.meta is undefined: reading .owner throws inside the matcher
    const decision = await this.engine.decide(writer, "Notes.Edit", ctx("Notes.Edit", { user, input: {} }));
    assert.notStrictEqual(decision, true);
  }

  @test
  async probeMode() {
    const editor = ["user:u1", "group:editors"];
    // Input-dependent allow matches in probe mode
    assert.strictEqual(await this.engine.decide(editor, "Tasks.Update", ctx("Tasks.Update", { probe: true, input: undefined })), true);
    // Unconditional deny still applies
    assert.notStrictEqual(await this.engine.decide(editor, "Tasks.Delete", ctx("Tasks.Delete", { probe: true, input: undefined })), true);
    // Input-dependent deny does not hide the operation
    assert.strictEqual(await this.engine.decide(["user:root"], "Billing.Refund", ctx("Billing.Refund", { probe: true, input: undefined })), true);
  }

  @test
  async emptyEngine() {
    const engine = await PolicyEngine.build([], []);
    assert.notStrictEqual(await engine.decide(["user:x"], "A.B", ctx("A.B")), true);
  }
}
