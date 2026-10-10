import {
  callOperation,
  canCallOperation,
  OperationContext,
  registerOperation,
  registerSchema,
  Service,
  unregisterOperationAuthorizer,
  useApplication,
  useCore,
  WebdaError
} from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { IAMTest } from "../test/fixture.js";
import { isIAMActive } from "./active.js";
import { PolicyCompileError } from "./conditions.js";
import { IAMPolicy } from "./iampolicy.model.js";
import { IAMPolicyAttachment } from "./iampolicyattachment.model.js";
import { IAMService, IAMServiceParameters } from "./iam.service.js";

/**
 * Operation context with a stubbed user and a JSON body
 */
class IAMContext extends OperationContext {
  constructor(
    protected user?: { uuid: string; groups?: string[]; broken?: boolean; missing?: boolean; loads?: number },
    protected body?: any
  ) {
    super();
  }
  getCurrentUserId(): any {
    return this.user?.uuid;
  }
  async getCurrentUser(): Promise<any> {
    if (this.user) {
      this.user.loads = (this.user.loads ?? 0) + 1;
    }
    await new Promise(resolve => setTimeout(resolve, 1));
    if (this.user?.broken) {
      throw new Error("user store down");
    }
    if (this.user?.missing) {
      return undefined;
    }
    return this.user ? { getGroups: () => this.user.groups ?? [], getRoles: () => [] } : undefined;
  }
  async getRawInputAsString(): Promise<string> {
    return this.body === undefined ? "" : JSON.stringify(this.body);
  }
  async getRawInput(): Promise<Buffer> {
    return Buffer.from(await this.getRawInputAsString());
  }
}

/**
 * Service implementing the test operations
 */
class TaskOps extends Service {
  async run(): Promise<string> {
    return "ok";
  }
}

const POLICIES = [
  {
    name: "TaskEditor",
    statements: [
      { effect: "allow", operations: ["Tasks.*"], condition: "r.ctx.input.status != 'archived'" },
      { effect: "deny", operations: ["Tasks.Delete"] }
    ]
  },
  {
    name: "IAMAdmin",
    statements: [
      {
        effect: "allow",
        operations: ["IAMPolicy.*", "IAMPolicies.*", "IAMPolicyAttachment.*", "IAMPolicyAttachments.*"]
      }
    ]
  },
  {
    name: "OwnNotes",
    statements: [
      { effect: "allow", operations: ["Tasks.Note"], condition: "r.ctx.input.meta.owner == r.ctx.user.uuid" }
    ]
  },
  { name: "Public", statements: [{ effect: "allow", operations: ["Tasks.Public"] }] }
];

const INPUT_SCHEMA = {
  type: "object",
  properties: { status: { type: "string" }, meta: { type: "object" } }
};
let schemaRegistered = false;

@suite
class IAMServiceTest extends IAMTest {
  service: IAMService;

  async beforeEach() {
    await super.beforeEach();
    useCore().getServices()["TaskOps"] ??= new TaskOps("TaskOps", {} as any);
    // registerOperation only keeps an input known by the application; the Ajv registry is process-wide
    useApplication<any>().getSchemas()["iamtest.input"] = INPUT_SCHEMA;
    if (!schemaRegistered) {
      registerSchema("iamtest.input", INPUT_SCHEMA);
      schemaRegistered = true;
    }
    for (const id of ["Tasks.Update", "Tasks.Delete", "Tasks.Note", "Tasks.Public", "Other.Op"]) {
      registerOperation(id, { service: "TaskOps", method: "run", input: "iamtest.input", output: "void" } as any);
    }
    this.service = await this.addService(
      IAMService,
      {
        type: "Webda/IAMService",
        reloadDelay: 0,
        reloadInterval: 0,
        scope: ["Tasks.*"],
        policies: POLICIES as any,
        attachments: {
          "group:editors": ["TaskEditor"],
          "group:admins": ["IAMAdmin"],
          authenticated: ["OwnNotes"]
        }
      },
      "IAM"
    );
  }

  async afterEach() {
    await this.service.stop();
    // A stopped IAMService keeps refusing: remove it before the next test registers a new one
    unregisterOperationAuthorizer((this.service as any).authorizer);
    delete useCore().getServices()["IAM"];
    for (const attachment of (await IAMPolicyAttachment.query("")).results ?? []) {
      await attachment.delete();
    }
    for (const policy of (await IAMPolicy.query("")).results ?? []) {
      await policy.delete();
    }
  }

  async call(ctx: IAMContext, operationId: string) {
    await ctx.init();
    return callOperation(ctx, operationId);
  }

  @test
  async allowsAttachedGroupAndRefusesOthers() {
    const editor = { uuid: "u1", groups: ["editors"] };
    await this.call(new IAMContext(editor, { status: "draft" }), "Tasks.Update");
    await assert.rejects(
      () => this.call(new IAMContext(editor, { status: "archived" }), "Tasks.Update"),
      WebdaError.Forbidden
    );
    await assert.rejects(
      () => this.call(new IAMContext(editor, { status: "draft" }), "Tasks.Delete"),
      WebdaError.Forbidden
    );
    await assert.rejects(
      () => this.call(new IAMContext({ uuid: "u2" }, { status: "draft" }), "Tasks.Update"),
      WebdaError.Forbidden
    );
  }

  @test
  async anonymousNeedsAnAttachment() {
    await assert.rejects(() => this.call(new IAMContext(undefined, {}), "Tasks.Public"), WebdaError.Forbidden);
    await IAMPolicyAttachment.create({ principal: "anonymous", policy: "Public" } as any);
    await this.service.reload();
    await this.call(new IAMContext(undefined, {}), "Tasks.Public");
  }

  @test
  async outOfScopeOperationsPassThrough() {
    await this.call(new IAMContext(undefined, {}), "Other.Op");
    assert.strictEqual(this.service.isInScope("Other.Op"), false);
    for (const id of [
      "IAMPolicy.Create",
      "IAMPolicies.Query",
      "IAMPolicyAttachment.Delete",
      "IAMPolicyAttachments.Query"
    ]) {
      assert.strictEqual(this.service.isInScope(id), true, id);
    }
  }

  @test
  async probeModeForListings() {
    const editor = new IAMContext({ uuid: "u1", groups: ["editors"] });
    await editor.init();
    assert.strictEqual(await canCallOperation(editor, "Tasks.Update"), true);
    assert.strictEqual(await canCallOperation(editor, "Tasks.Delete"), false);
    assert.strictEqual(await canCallOperation(editor, "Tasks.Update", { input: { status: "archived" } }), false);
  }

  @test
  async missingNestedFieldIsForbidden() {
    await assert.rejects(() => this.call(new IAMContext({ uuid: "u3" }, {}), "Tasks.Note"), WebdaError.Forbidden);
    await this.call(new IAMContext({ uuid: "u3" }, { meta: { owner: "u3" } }), "Tasks.Note");
  }

  @test
  async userLoadFailureIsRefused() {
    // Without its groups a group deny could be skipped: a caller whose user cannot be loaded is refused
    await assert.rejects(
      () => this.call(new IAMContext({ uuid: "u4", broken: true }, { meta: { owner: "u4" } }), "Tasks.Note"),
      WebdaError.Forbidden
    );
    await assert.rejects(
      () => this.call(new IAMContext({ uuid: "u4", missing: true }, { meta: { owner: "u4" } }), "Tasks.Note"),
      WebdaError.Forbidden
    );
    // The control: the same call with a loadable user is allowed
    await this.call(new IAMContext({ uuid: "u4" }, { meta: { owner: "u4" } }), "Tasks.Note");
  }

  @test
  async storedPoliciesReloadOnChange() {
    const ops = { uuid: "u5", groups: ["ops"] };
    await assert.rejects(() => this.call(new IAMContext(ops, {}), "Tasks.Public"), WebdaError.Forbidden);
    await IAMPolicy.create({
      name: "OpsPublic",
      statements: [{ effect: "allow", operations: ["Tasks.Public"] }]
    } as any);
    const attachment = await IAMPolicyAttachment.create({ principal: "group:ops", policy: "OpsPublic" } as any);
    await this.sleep(20);
    await this.call(new IAMContext(ops, {}), "Tasks.Public");
    await attachment.delete();
    await this.sleep(20);
    await assert.rejects(() => this.call(new IAMContext(ops, {}), "Tasks.Public"), WebdaError.Forbidden);
  }

  @test
  async invalidStoredPolicyKeepsPreviousEngine() {
    const before = (this.service as any).engine;
    // Written through the model API, bypassing the authorizer validation
    await IAMPolicy.create({
      name: "Bad",
      statements: [{ effect: "allow", operations: ["*"], condition: "r.ctx.constructor" }]
    } as any);
    await this.service.reload();
    assert.strictEqual((this.service as any).engine, before);
    await IAMPolicy.ref("Bad").delete();
    await IAMPolicy.create({ name: "TaskEditor", statements: [{ effect: "allow", operations: ["*"] }] } as any);
    await this.service.reload();
    assert.strictEqual((this.service as any).engine, before, "a model may not shadow a configuration policy");
  }

  @test
  async validatesPolicyInput() {
    const admin = new IAMContext({ uuid: "a1", groups: ["admins"] });
    await admin.init();
    const bad = { name: "X", statements: [{ effect: "allow", operations: ["*"], condition: "r.ctx.constructor" }] };
    await assert.rejects(
      () => this.service.authorize(admin, "IAMPolicy.Create", { input: bad, probe: false }),
      WebdaError.BadRequest
    );
    await assert.rejects(
      () =>
        this.service.authorize(admin, "IAMPolicy.Create", {
          input: { name: "TaskEditor", statements: [] },
          probe: false
        }),
      WebdaError.BadRequest
    );
    assert.strictEqual(
      await this.service.authorize(admin, "IAMPolicy.Create", { input: { name: "Ok", statements: [] }, probe: false }),
      true
    );
    const editor = new IAMContext({ uuid: "u1", groups: ["editors"] });
    await editor.init();
    assert.notStrictEqual(await this.service.authorize(editor, "IAMPolicy.Create", { input: bad, probe: false }), true);
  }

  @test
  async invalidConfigurationFailsResolve() {
    const service = new IAMService(
      "BadIAM",
      new IAMServiceParameters().load({
        policies: [{ name: "x", statements: [{ effect: "allow", operations: ["*"], condition: "process.exit()" }] }]
      })
    );
    assert.throws(() => service.resolve(), PolicyCompileError);
  }

  @test
  async notInitializedRefuses() {
    const service = new IAMService("Fresh", new IAMServiceParameters().load({}));
    const ctx = new IAMContext({ uuid: "u1" });
    assert.notStrictEqual(await service.authorize(ctx, "Tasks.Update", { input: {}, probe: false }), true);
  }

  @test
  async stoppedServiceKeepsRefusing() {
    const editor = { uuid: "u1", groups: ["editors"] };
    await this.call(new IAMContext(editor, { status: "draft" }), "Tasks.Update");
    assert.strictEqual(isIAMActive(), true);
    await this.service.stop();
    // In-scope operations are refused during and after a graceful shutdown; out-of-scope ones still pass
    await assert.rejects(
      () => this.call(new IAMContext(editor, { status: "draft" }), "Tasks.Update"),
      WebdaError.Forbidden
    );
    await this.call(new IAMContext(undefined, {}), "Other.Op");
    // The IAM models are closed again
    assert.strictEqual(isIAMActive(), false);
    assert.notStrictEqual(await IAMPolicy.canAct(undefined as any, "create"), true);
    // A rebuild after stop is discarded
    await this.service.reload();
    await assert.rejects(
      () => this.call(new IAMContext(editor, { status: "draft" }), "Tasks.Update"),
      WebdaError.Forbidden
    );
  }

  @test
  async invalidScopeFailsResolve() {
    const service = new IAMService("BadScope", new IAMServiceParameters().load({ scope: ["Tasks.{Get,Delete}"] }));
    assert.throws(() => service.resolve(), PolicyCompileError);
  }

  @test
  async createValidatesTheWholeDocument() {
    const admin = new IAMContext({ uuid: "a1", groups: ["admins"] });
    await admin.init();
    for (const input of [{ statements: [] }, { name: "", statements: [] }, { name: "NoStatements" }]) {
      await assert.rejects(
        () => this.service.authorize(admin, "IAMPolicy.Create", { input, probe: false }),
        WebdaError.BadRequest,
        JSON.stringify(input)
      );
    }
    await assert.rejects(
      () =>
        this.service.authorize(admin, "IAMPolicy.Create", {
          input: { name: "Brace", statements: [{ effect: "allow", operations: ["Tasks.{Get,Delete}"] }] },
          probe: false
        }),
      WebdaError.BadRequest
    );
  }

  @test
  async userIsLoadedOncePerListing() {
    const editor = { uuid: "u1", groups: ["editors"], loads: 0 };
    const ctx = new IAMContext(editor);
    await ctx.init();
    const ids = ["Tasks.Update", "Tasks.Delete", "Tasks.Note", "Tasks.Public"];
    await Promise.all(ids.map(id => canCallOperation(ctx, id)));
    await canCallOperation(ctx, "Tasks.Update");
    assert.strictEqual(editor.loads, 1);
    // A failed load is not cached
    const broken = { uuid: "u4", broken: true, loads: 0 };
    const brokenCtx = new IAMContext(broken);
    await brokenCtx.init();
    assert.strictEqual(await canCallOperation(brokenCtx, "Tasks.Update"), false);
    assert.strictEqual(await canCallOperation(brokenCtx, "Tasks.Update"), false);
    assert.strictEqual(broken.loads, 2);
  }

  @test
  async firstBuildFailureStillWatches() {
    // Written through the model API, bypassing the authorizer validation
    await IAMPolicy.create({
      name: "Broken",
      statements: [{ effect: "allow", operations: ["*"], condition: "r.ctx.constructor" }]
    } as any);
    const service = new IAMService(
      "Recovering",
      new IAMServiceParameters().load({
        reloadDelay: 0,
        reloadInterval: 300,
        scope: ["Tasks.*"],
        policies: POLICIES as any,
        attachments: { "group:editors": ["TaskEditor"] }
      })
    );
    service.resolve();
    try {
      await assert.rejects(() => service.init(), PolicyCompileError);
      assert.ok((service as any).intervalTimer, "the periodic rebuild is started");
      const editor = new IAMContext({ uuid: "u1", groups: ["editors"] });
      await editor.init();
      assert.notStrictEqual(await service.authorize(editor, "Tasks.Update", { input: {}, probe: false }), true);
      await IAMPolicy.ref("Broken").delete();
      await service.reload();
      assert.strictEqual(await service.authorize(editor, "Tasks.Update", { input: {}, probe: false }), true);
    } finally {
      await service.stop();
      unregisterOperationAuthorizer((service as any).authorizer);
    }
  }
}
