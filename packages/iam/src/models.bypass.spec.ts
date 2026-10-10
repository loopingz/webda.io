import {
  callOperation,
  canCallOperation,
  checkModelPermission,
  DomainService,
  loadModelForAction,
  queryModelWithPermissions,
  registerOperation,
  registerOperationAuthorizer,
  Service,
  SimpleOperationContext,
  unregisterOperationAuthorizer,
  useApplication,
  useCore,
  useInstanceStorage,
  WebdaError
} from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { IAMTest } from "../test/fixture.js";
import { IAM_ALLOWED_OPERATION, isIAMActive } from "./active.js";
import { IAMPolicy } from "./iampolicy.model.js";
import { IAMPolicyAttachment } from "./iampolicyattachment.model.js";
import { IAMService } from "./iam.service.js";

/**
 * Service implementing an operation outside the IAM models
 */
class BypassOps extends Service {
  async run(): Promise<string> {
    return "ok";
  }
}

/**
 * The IAM models with a running IAMService allowing every IAM operation to the (anonymous) caller, except
 * `IAMPolicy.Delete`:
 * - through the operation path (callOperation, as REST/gRPC/MCP do) the calls are allowed;
 * - through a path that only consults the model `canAct` (as GraphQL CRUD does), the same caller is refused
 */
@suite
class IAMModelsBypassTest extends IAMTest {
  service: IAMService;

  /**
   * @returns a new anonymous context
   * @param body - the JSON body
   * @param parameters - the path parameters
   */
  async context(body: any = {}, parameters: any = {}): Promise<SimpleOperationContext> {
    const ctx = new SimpleOperationContext();
    ctx.setInput(Buffer.from(JSON.stringify(body)));
    ctx.setParameters(parameters);
    await ctx.init();
    return ctx;
  }

  /**
   * Call an operation as an anonymous caller
   * @param operationId - the operation id
   * @param body - the JSON body
   * @param parameters - the path parameters
   * @returns the parsed output
   */
  async call(operationId: string, body: any = {}, parameters: any = {}) {
    assert.ok(useInstanceStorage().operations[operationId], `${operationId} is registered`);
    const ctx = await this.context(body, parameters);
    await callOperation(ctx, operationId);
    const output: any = ctx.getOutput();
    return typeof output === "string" && output ? JSON.parse(output) : output;
  }

  async beforeEach() {
    await super.beforeEach();
    const app = useApplication<any>();
    const isFinalModel = app.isFinalModel.bind(app);
    this.stub(app, "isFinalModel").callsFake((model: string) => model.startsWith("Webda/IAM") || isFinalModel(model));
    useCore().getService<DomainService>("DomainService").initOperations();
    useCore().getServices()["BypassOps"] ??= new BypassOps("BypassOps", {} as any);
    registerOperation("Bypass.Op", { service: "BypassOps", method: "run", output: "void" } as any);
    this.service = await this.addService(
      IAMService,
      {
        type: "Webda/IAMService",
        reloadDelay: 0,
        reloadInterval: 0,
        scope: ["Tasks.*"],
        policies: [
          {
            name: "IAMAdmin",
            statements: [
              {
                effect: "allow",
                operations: ["IAMPolicy.*", "IAMPolicies.*", "IAMPolicyAttachment.*", "IAMPolicyAttachments.*"]
              },
              { effect: "deny", operations: ["IAMPolicy.Delete"] }
            ]
          }
        ] as any,
        attachments: { anonymous: ["IAMAdmin"] }
      },
      "IAM"
    );
    assert.strictEqual(isIAMActive(), true);
  }

  async afterEach() {
    await this.service.stop();
    unregisterOperationAuthorizer((this.service as any).authorizer);
    delete useCore().getServices()["IAM"];
    for (const attachment of (await IAMPolicyAttachment.query("")).results ?? []) {
      await attachment.delete();
    }
    for (const policy of (await IAMPolicy.query("")).results ?? []) {
      await policy.delete();
    }
    await super.afterEach();
  }

  @test
  async operationPathIsAllowed() {
    await this.call("IAMPolicy.Create", { name: "Readers", statements: [{ effect: "allow", operations: ["*.Get"] }] });
    assert.deepStrictEqual((await IAMPolicy.ref("Readers").get()).statements, [
      { effect: "allow", operations: ["*.Get"] }
    ]);
    const policy = await this.call("IAMPolicy.Get", {}, { name: "Readers" });
    assert.strictEqual(policy.name, "Readers");
    await this.call("IAMPolicy.Patch", { description: "patched" }, { name: "Readers" });
    assert.strictEqual((await IAMPolicy.ref("Readers").get()).description, "patched");
    await this.call("IAMPolicyAttachment.Create", { principal: "group:x", policy: "Readers" });
    // Listing rows are checked with the operation context: they pass
    assert.strictEqual((await this.call("IAMPolicies.Query", { q: "" })).results.length, 1);
    const attachments = (await this.call("IAMPolicyAttachments.Query", { q: "" })).results;
    assert.strictEqual(attachments.length, 1);
    await this.call("IAMPolicyAttachment.Delete", {}, { uuid: attachments[0].uuid });
    assert.strictEqual((await IAMPolicyAttachment.query("")).results.length, 0);
    await this.call(
      "IAMPolicy.Update",
      { name: "Readers", description: "updated", statements: [{ effect: "allow", operations: ["*.Query"] }] },
      { name: "Readers" }
    );
    const updated = await IAMPolicy.ref("Readers").get();
    assert.strictEqual(updated.description, "updated");
    assert.deepStrictEqual(updated.statements, [{ effect: "allow", operations: ["*.Query"] }]);
    // Refused by the policy
    await assert.rejects(() => this.call("IAMPolicy.Delete", {}, { name: "Readers" }), WebdaError.Forbidden);
    assert.ok(await IAMPolicy.ref("Readers").get());
  }

  @test
  async operationPathDeletesWhenAllowed() {
    await this.service.stop();
    unregisterOperationAuthorizer((this.service as any).authorizer);
    this.service = await this.addService(
      IAMService,
      {
        type: "Webda/IAMService",
        reloadDelay: 0,
        reloadInterval: 0,
        scope: ["Tasks.*"],
        policies: [{ name: "IAMAdmin", statements: [{ effect: "allow", operations: ["IAMPolicy.*"] }] }] as any,
        attachments: { anonymous: ["IAMAdmin"] }
      },
      "IAM"
    );
    await IAMPolicy.create({ name: "Gone", statements: [] } as any);
    await this.call("IAMPolicy.Delete", {}, { name: "Gone" });
    await assert.rejects(() => IAMPolicy.ref("Gone").get());
  }

  @test
  async laterAuthorizerRefusalClearsTheMarker() {
    await IAMPolicy.create({ name: "Stored", statements: [] } as any);
    // Registered after the IAMService: IAM allows (and marks), then this one refuses
    const refuser = async (_ctx: any, operationId: string) =>
      operationId === "IAMPolicy.Get" ? "refused by another authorizer" : (true as const);
    registerOperationAuthorizer(refuser);
    try {
      const ctx = await this.context({}, { name: "Stored" });
      await assert.rejects(() => callOperation(ctx, "IAMPolicy.Get"), WebdaError.Forbidden);
      assert.strictEqual(ctx.getExtension("operation"), "IAMPolicy.Get");
      assert.strictEqual(ctx.getExtension(IAM_ALLOWED_OPERATION), undefined);
      assert.notStrictEqual(await IAMPolicy.canAct(ctx, "get"), true);
      await assert.rejects(() => loadModelForAction(IAMPolicy, "Stored", ctx, "get"), WebdaError.NotFound);
    } finally {
      unregisterOperationAuthorizer(refuser);
    }
  }

  @test
  async canActOnlyPathIsRefused() {
    await IAMPolicy.create({ name: "Stored", statements: [] } as any);
    const attachment = await IAMPolicyAttachment.create({ principal: "group:x", policy: "Stored" } as any);
    // A context that never went through callOperation, as a GraphQL resolver uses
    const ctx = await this.context();
    await assert.rejects(
      () =>
        checkModelPermission(
          new IAMPolicy({ name: "Open", statements: [{ effect: "allow", operations: ["*"] }] } as any),
          ctx,
          "create",
          IAMPolicy
        ),
      WebdaError.Forbidden
    );
    await assert.rejects(
      () =>
        checkModelPermission(
          new IAMPolicyAttachment({ principal: "anonymous", policy: "IAMAdmin" } as any),
          ctx,
          "create",
          IAMPolicyAttachment
        ),
      WebdaError.Forbidden
    );
    assert.strictEqual((await queryModelWithPermissions(IAMPolicy, "", ctx)).results.length, 0);
    assert.strictEqual((await queryModelWithPermissions(IAMPolicyAttachment, "", ctx)).results.length, 0);
    for (const action of ["get", "update", "delete"]) {
      await assert.rejects(() => loadModelForAction(IAMPolicy, "Stored", ctx, action), WebdaError.NotFound, action);
      await assert.rejects(
        () => loadModelForAction(IAMPolicyAttachment, attachment.uuid, ctx, action),
        WebdaError.NotFound,
        action
      );
    }
  }

  @test
  async contextReusedAfterAnotherOperationIsRefused() {
    // Through callOperation for a non-IAM operation
    const ctx = await this.context();
    await callOperation(ctx, "Bypass.Op");
    assert.notStrictEqual(await IAMPolicy.canAct(ctx, "create"), true);
    await assert.rejects(
      () => checkModelPermission(new IAMPolicy({ name: "Open" } as any), ctx, "create", IAMPolicy),
      WebdaError.Forbidden
    );
    // An IAM operation allowed earlier on the context, then another operation: the marker is stale
    const reused = await this.context({}, { name: "Stored" });
    await IAMPolicy.create({ name: "Stored", statements: [] } as any);
    await callOperation(reused, "IAMPolicy.Get");
    // The operation returned: its marker is gone, no residual authorization for any action
    assert.strictEqual(reused.getExtension(IAM_ALLOWED_OPERATION), undefined);
    assert.notStrictEqual(await IAMPolicy.canAct(reused, "get"), true);
    assert.notStrictEqual(await IAMPolicy.canAct(reused, "delete"), true);
    await assert.rejects(() => loadModelForAction(IAMPolicy, "Stored", reused, "delete"), WebdaError.NotFound);
    // Same after a failed IAM operation
    await assert.rejects(() => callOperation(reused, "IAMPolicy.Delete"), WebdaError.Forbidden);
    assert.notStrictEqual(await IAMPolicy.canAct(reused, "delete"), true);
    await callOperation(reused, "Bypass.Op");
    assert.notStrictEqual(await IAMPolicy.canAct(reused, "get"), true);
    assert.notStrictEqual(await IAMPolicyAttachment.canAct(reused, "create"), true);
    assert.strictEqual((await queryModelWithPermissions(IAMPolicy, "", reused)).results.length, 0);
  }

  @test
  async probeNeverMarks() {
    const ctx = await this.context();
    assert.strictEqual(await canCallOperation(ctx, "IAMPolicy.Create"), true);
    assert.strictEqual(ctx.getExtension(IAM_ALLOWED_OPERATION), undefined);
    // Even with a matching current operation, a probe is no authorization
    ctx.setExtension("operation", "IAMPolicy.Create");
    assert.notStrictEqual(await IAMPolicy.canAct(ctx, "create"), true);
  }

  @test
  async refusalClearsTheMarker() {
    const ctx = await this.context();
    ctx.setExtension("operation", "IAMPolicy.Get");
    assert.strictEqual(await this.service.authorize(ctx, "IAMPolicy.Get", { probe: false }), true);
    assert.strictEqual(ctx.getExtension(IAM_ALLOWED_OPERATION), "IAMPolicy.Get");
    assert.strictEqual(await IAMPolicy.canAct(ctx, "get"), true);
    // Refused by the deny statement
    assert.notStrictEqual(await this.service.authorize(ctx, "IAMPolicy.Delete", { probe: false }), true);
    assert.strictEqual(ctx.getExtension(IAM_ALLOWED_OPERATION), undefined);
    assert.notStrictEqual(await IAMPolicy.canAct(ctx, "get"), true);
    // A non-IAM operation never marks
    assert.strictEqual(await this.service.authorize(ctx, "Bypass.Op", { probe: false }), true);
    assert.strictEqual(ctx.getExtension(IAM_ALLOWED_OPERATION), undefined);
  }
}
